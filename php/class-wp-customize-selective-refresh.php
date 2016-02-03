<?php
/**
 * Implements selective (partial) refresh.
 */
class WP_Customize_Selective_Refresh {

	const RENDER_QUERY_VAR = 'wp_customize_partials_render';

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
		require_once __DIR__ . '/class-wp-customize-partial.php';
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
		add_action( 'customize_register', array( $this, 'disable_core_nav_menu_refresh' ) );
	}

	/**
	 * Disable nav menu partial refresh as bundled in Core.
	 *
	 * @param WP_Customize_Manager $wp_customize Manager.
	 */
	public function disable_core_nav_menu_refresh( $wp_customize ) {
		if ( ! empty( $wp_customize->nav_menus ) ) {
			remove_action( 'customize_preview_init', array( $wp_customize->nav_menus, 'customize_preview_init' ) );
		}
	}

	/**
	 * Initialize Customizer preview.
	 *
	 * @action customize_preview_init
	 */
	public function init_preview() {
		add_action( 'template_redirect', array( $this, 'render_partials' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_preview_scripts' ) );
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

		$partials = array();
		foreach ( $this->partials() as $partial ) {
			$partials[ $partial->id ] = $partial->json();
		}

		$exports = array(
			'partials'       => $partials,
			'renderQueryVar' => self::RENDER_QUERY_VAR,
			'l10n'           => array(
				'shiftClickToEdit' => __( 'Shift-click to edit this element.' ),
			),
		);

		// Export data to JS.
		wp_scripts()->add_data(
			$this->plugin->script_handles['selective-refresh-preview'],
			'data',
			sprintf( 'var _customizeSelectiveRefreshExports = %s;', wp_json_encode( $exports ) )
		);
	}

	/**
	 * Ajax request to return the settings partial value.
	 *
	 * @action template_redirect
	 */
	public function render_partials() {
		if ( ! isset( $_POST[ static::RENDER_QUERY_VAR ] ) ) {
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
		} else if ( ! isset( $_POST['partials'] ) ) {
			status_header( 400 );
			wp_send_json_error( 'missing_partials' );
		}
		$partials = json_decode( wp_unslash( $_POST['partials'] ), true );
		if ( ! is_array( $partials ) ) {
			wp_send_json_error( 'malformed_partials' );
		}

		// @todo Do wp_enqueue_scripts() so that we can gather the enqueued scripts and return them in the response?

		$contents = array();
		foreach ( $partials as $partial_id => $container_contexts ) {
			if ( ! is_array( $container_contexts ) ) {
				wp_send_json_error( 'malformed_container_contexts' );
			}
			$contents[ $partial_id ] = array();
			$partial = $this->get_partial( $partial_id );
			if ( ! $partial ) {
				wp_send_json_error( 'unrecognized_partial' );
			}

			if ( empty( $container_contexts ) ) {
				// Since there are no container contexts, render just once.
				$contents[ $partial_id ][] = $partial->render( null );
			} else {
				foreach ( $container_contexts as $container_context ) {
					$contents[ $partial_id ][] = $partial->render( $container_context );
				}
			}
		}

		$response = array(
			'contents' => $contents,
		);
		// @todo Export scripts from wp_scripts()->queue? These are dangerous because of document.write(); we'd need to override the default implementation.
		// @todo This may be out of scope and should instead be handled when a partial is registered.

		wp_send_json_success( $response );
	}
}
