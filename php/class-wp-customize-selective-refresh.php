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
	 * Selective refresh for nav menus.
	 *
	 * @var WP_Customize_Nav_Menu_Selective_Refresh
	 */
	public $nav_menu_selective_refresh;

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
	 * @since 4.5.0
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
			$class = 'WP_Customize_Partial';

			/** This filter (will be) documented in wp-includes/class-wp-customize-manager.php */
			$args = apply_filters( 'customize_dynamic_partial_args', $args, $id );

			/** This filter (will be) documented in wp-includes/class-wp-customize-manager.php */
			$class = apply_filters( 'customize_dynamic_partial_class', $class, $id, $args );

			$partial = new $class( $this->plugin, $id, $args );
		}

		$this->partials[ $partial->id ] = $partial;
		return $partial;
	}

	/**
	 * Retrieve a customize partial.
	 *
	 * @since 4.5.0
	 * @access public
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
	 * @access public
	 *
	 * @param string $id Customize Partial ID.
	 */
	public function remove_partial( $id ) {
		unset( $this->partials[ $id ] );
	}

	/**
	 * Initialize selective partial refresh.
	 *
	 * @since 4.5.0
	 * @access public
	 */
	public function init() {
		global $wp_customize;
		if ( ! isset( $wp_customize ) ) {
			return;
		}
		require_once dirname( __FILE__ ) . '/class-wp-customize-partial.php';
		require_once dirname( __FILE__ ) . '/class-wp-customize-nav-menu-selective-refresh.php';
		$this->manager = $wp_customize;
		$this->nav_menu_selective_refresh = new WP_Customize_Nav_Menu_Selective_Refresh( $this->plugin, $this->manager );
		add_action( 'customize_controls_print_footer_scripts', array( $this, 'enqueue_pane_scripts' ) );
		add_action( 'customize_preview_init', array( $this, 'init_preview' ) );
	}

	/**
	 * Initialize Customizer preview.
	 *
	 * @since 4.5.0
	 * @access public
	 */
	public function init_preview() {
		add_action( 'template_redirect', array( $this, 'handle_render_partials_request' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_preview_scripts' ) );
	}

	/**
	 * Enqueue pane scripts.
	 *
	 * @since 4.5.0
	 * @access public
	 */
	public function enqueue_pane_scripts() {
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
	 * @since 4.5.0
	 * @access public
	 */
	public function enqueue_preview_scripts() {
		wp_enqueue_script( $this->plugin->script_handles['selective-refresh-preview'] );

		add_action( 'wp_footer', array( $this, 'export_preview_data' ), 1000 );
	}

	/**
	 * Export data in preview after it has finished rendering so that partials can be added at runtime.
	 *
	 * @since 4.5.0
	 * @access public
	 */
	public function export_preview_data() {

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
		echo sprintf( '<script>var _customizeSelectiveRefreshExports = %s;</script>', wp_json_encode( $exports ) );
	}

	/**
	 * Register dynamically-created partials.
	 *
	 * @since 4.5.0
	 * @access public
	 * @see WP_Customize_Manager::add_dynamic_settings()
	 *
	 * @param array $partial_ids         The partial ID to add.
	 * @return WP_Customize_Partial|null The instance or null if no filters applied.
	 */
	public function add_dynamic_partials( $partial_ids ) {
		$new_partials = array();

		foreach ( $partial_ids as $partial_id ) {

			// Skip partials already created.
			$partial = $this->get_partial( $partial_id );
			if ( $partial ) {
				continue;
			}

			$partial_args = false;
			$partial_class = 'WP_Customize_Partial';

			/**
			 * Filter a dynamic partial's constructor args.
			 *
			 * For a dynamic partial to be registered, this filter must be employed
			 * to override the default false value with an array of args to pass to
			 * the WP_Customize_Setting constructor.
			 *
			 * @since 4.5.0
			 *
			 * @param false|array $partial_args The arguments to the WP_Customize_Setting constructor.
			 * @param string      $partial_id   ID for dynamic partial, usually coming from `$_POST['customized']`.
			 */
			$partial_args = apply_filters( 'customize_dynamic_partial_args', $partial_args, $partial_id );
			if ( false === $partial_args ) {
				continue;
			}

			/**
			 * Allow non-statically created partials to be constructed with custom WP_Customize_Setting subclass.
			 *
			 * @since 4.5.0
			 *
			 * @param string $partial_class WP_Customize_Setting or a subclass.
			 * @param string $partial_id    ID for dynamic partial, usually coming from `$_POST['customized']`.
			 * @param array  $partial_args  WP_Customize_Setting or a subclass.
			 */
			$partial_class = apply_filters( 'customize_dynamic_partial_class', $partial_class, $partial_id, $partial_args );

			$partial = new $partial_class( $this->plugin, $partial_id, $partial_args );

			$this->add_partial( $partial );
			$new_partials[] = $partial;
		}
		return $new_partials;
	}

	/**
	 * Return whether the current request is to render partials.
	 *
	 * Note that this does not validate the request arguments, such as the nonce.
	 *
	 * @return bool
	 */
	public function is_partial_render_request() {
		return ! empty( $_POST[ static::RENDER_QUERY_VAR ] );
	}

	/**
	 * Handle Ajax request to return the settings partial value.
	 *
	 * @since 4.5.0
	 * @access public
	 */
	public function handle_render_partials_request() {
		if ( ! $this->is_partial_render_request() ) {
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
		$this->add_dynamic_partials( array_keys( $partials ) );

		// @todo Do wp_enqueue_scripts() so that we can gather the enqueued scripts and return them in the response?

		$contents = array();
		foreach ( $partials as $partial_id => $container_contexts ) {
			if ( ! is_array( $container_contexts ) ) {
				wp_send_json_error( 'malformed_container_contexts' );
			}

			$partial = $this->get_partial( $partial_id );
			if ( ! $partial ) {
				$contents[ $partial_id ] = null;
				continue;
			}

			$contents[ $partial_id ] = array();
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
