<?php
/**
 * Implements selective (partial) refresh.
 */
class WP_Customize_Selective_Refresh {

	const PARTIAL_RENDER_QUERY_VAR = 'wp_customize_partial_render';

	/**
	 * WP_Customize_Partial_Refresh_Plugin instance.
	 *
	 * @var WP_Customize_Partial_Refresh_Plugin
	 */
	public $plugin;

	/**
	 * Customize manager.
	 *
	 * @var WP_Customize_Manager
	 */
	public $manager;

	/**
	 * Constructor.
	 *
	 * @param WP_Customize_Partial_Refresh_Plugin $plugin Plugin instance.
	 */
	public function __construct( WP_Customize_Partial_Refresh_Plugin $plugin ) {
		$this->plugin = $plugin;
		add_action( 'after_setup_theme', array( $this, 'init' ), 11 );
	}

	/**
	 * Registered instances of WP_Customize_Partial.
	 *
	 * @todo This would be added to WP_Customize_Manager.
	 *
	 * @since 4.5.0
	 * @access protected
	 * @var WP_Customize_Partial[]
	 */
	protected $partials = array();

	/**
	 * Get the registered partials.
	 *
	 * @todo This would be added to WP_Customize_Manager.
	 *
	 * @since 4.5.0
	 * @access public
	 *
	 * @return WP_Customize_Partial[] Partials.
	 */
	public function partials() {
		return $this->partials;
	}

	/**
	 * Add a customize partial.
	 *
	 * @todo This would be added to WP_Customize_Manager.
	 *
	 * @access public
	 *
	 * @param WP_Customize_Partial|string $id   Customize Partial object, or Panel ID.
	 * @param array                       $args Optional. Partial arguments. Default empty array.
	 *
	 * @return WP_Customize_Partial             The instance of the panel that was added.
	 */
	public function add_partial( $id, $args = array() ) {
		if ( $id instanceof WP_Customize_Partial ) {
			$partial = $id;
		} else {
			$partial = new WP_Customize_Partial( $this->plugin, $id, $args );
		}

		$this->partials[ $partial->id ] = $partial;
		return $partial;
	}

	/**
	 * Retrieve a customize partial.
	 *
	 * @since 4.5.0
	 *
	 * @param string $id Customize Partial ID.
	 * @return WP_Customize_Partial|null The partial, if set.
	 */
	public function get_partial( $id ) {
		if ( isset( $this->partials[ $id ] ) ) {
			return $this->partials[ $id ];
		} else {
			return null;
		}
	}

	/**
	 * Remove a customize partial.
	 *
	 * @since 4.5.0
	 *
	 * @param string $id Customize Partial ID.
	 */
	public function remove_partial( $id ) {
		unset( $this->partials[ $id ] );
	}

	/**
	 * Initialize selective partial refresh.
	 *
	 * @action after_setup_theme
	 */
	public function init() {
		global $wp_customize;
		if ( isset( $wp_customize ) ) {
			$this->manager = $wp_customize;
		}
		add_action( 'customize_controls_print_footer_scripts', array( $this, 'enqueue_pane_scripts' ) );
		add_action( 'customize_preview_init', array( $this, 'init_preview' ) );
	}

	/**
	 * Initialize Customizer preview.
	 *
	 * @action customize_preview_init
	 */
	public function init_preview() {
		add_action( 'template_redirect', array( $this, 'render_partial' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_preview_scripts' ) );
		add_action( 'wp_print_footer_scripts', array( $this, 'export_preview_data' ) );
	}

	/**
	 * Enqueue pane scripts.
	 *
	 * @action customize_controls_enqueue_scripts
	 */
	function enqueue_pane_scripts() {
		wp_enqueue_script( $this->plugin->script_handles['selective-refresh-pane'] );

		// Script data array.
		$exports = array();

		// Export data to JS.
		wp_scripts()->add_data(
			$this->plugin->script_handles['selective-refresh-pane'],
			'data',
			sprintf( 'var _customizeSelectiveRefreshExports = %s;', wp_json_encode( $exports ) )
		);
	}

	/**
	 * Enqueue preview scripts.
	 *
	 * @action wp_enqueue_scripts
	 */
	function enqueue_preview_scripts() {
		wp_enqueue_script( $this->plugin->script_handles['selective-refresh-preview'] );
	}

	/**
	 * Export data for the Customizer preview.
	 */
	function export_preview_data() {

		$partials = array();
		foreach ( $this->partials() as $partial ) {
			$partials[ $partial->id ] = $partial->json();
		}

		$exports = array(
			'partials'       => $partials,
			'renderQueryVar' => self::PARTIAL_RENDER_QUERY_VAR,
			'requestUri'     => empty( $_SERVER['REQUEST_URI'] ) ? home_url( '/' ) : esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ),
			'theme'          => array(
				'stylesheet' => $this->manager->get_stylesheet(),
				'active'     => $this->manager->is_theme_active(),
			),
			'previewNonce'   => wp_create_nonce( 'preview-customize_' . $this->manager->get_stylesheet() ), // @todo This needs to get updated when re-login or noncerefresh.
		);

		printf( 'var _customizeSelectiveRefreshExports = %s;', wp_json_encode( $exports ) );
	}

	/**
	 * Ajax request to return the settings partial value.
	 *
	 * @action template_redirect
	 */
	public function render_partial() {
		if ( ! isset( $_POST[ static::PARTIAL_RENDER_QUERY_VAR ] ) ) {
			return;
		}

		$this->manager->remove_preview_signature();

		// @todo Allow JS to pass additional args for the partial, like the context, such as the nav menu args. See \WP_Customize_Nav_Menus::render_menu();
		if ( ! check_ajax_referer( 'preview-customize_' . $this->manager->get_stylesheet(), 'nonce', false ) ) {
			status_header( 403 );
			wp_send_json_error( 'nonce_check_fail' );
		} else if ( ! current_user_can( 'customize' ) || ! is_customize_preview() ) {
			status_header( 403 );
			wp_send_json_error( 'expected_customize_preview' );
		} else if ( ! isset( $_POST['partial_ids'] ) ) {
			status_header( 400 );
			wp_send_json_error( 'missing_partial_ids' );
		} else if ( ! is_array( $_POST['partial_ids'] ) ) {
			status_header( 400 );
			wp_send_json_error( 'bad_partial_ids' );
		}

		$results = array();

		$partial_ids = wp_unslash( $_POST['partial_ids'] );
		foreach ( $partial_ids as $partial_id ) {
			$partial = $this->get_partial( $partial_id );
			if ( ! $partial ) {
				$results[ $partial_id ] = array( 'error' => 'unrecognized_partial' );
				continue;
			}

			$rendered = $partial->render();

			/*
			 * Note that the sanitized value of a given setting needn't be passed
			 * back to the Customizer here because this will be handled in the transaction
			 * PATCH request. Additionally, the rendering of a single raw setting value
			 * is not relevant since we are only interested in rendering template
			 * partials in which the setting is only a part. So the $rendered
			 * here does directly correspond to the $partial->settings in the
			 * sense of the REST API, although it is clearly related.
			 */

			/**
			 * Filter partial rendering.
			 *
			 * @param mixed                $rendered The partial value. Default null.
			 * @param WP_Customize_Partial $partial WP_Customize_Setting instance.
			 */
			$rendered = apply_filters( 'customize_setting_render', $rendered, $partial );

			/**
			 * Filter partial rendering by the partial ID.
			 *
			 * @param mixed                $rendered The partial value. Default null.
			 * @param WP_Customize_Partial $partial WP_Customize_Setting instance.
			 */
			$rendered = apply_filters( "customize_setting_render_{$partial->id}", $rendered, $partial );

			$results[ $partial_id ] = array(
				'data' => $rendered,
			);
		}

		wp_send_json_success( $results );
	}
}
