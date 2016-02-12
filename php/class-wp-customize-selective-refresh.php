<?php
/**
 * WordPress Customize Selective Refresh class
 *
 * @package WordPress
 * @subpackage Customize
 * @since 4.5.0
 */

/**
 * WordPress Customize Selective Refresh class
 *
 * This may be irrelevant to #coremerge since this will be merged with WP_Customize_Manager,
 * unless there is a new class introduced for managing partials as a component.
 *
 * @since 4.5.0
 */
class WP_Customize_Selective_Refresh {

	/**
	 * Not relevant to #coremerge.
	 */
	const VERSION = '0.5.4';

	/**
	 * Query var used in requests to render partials.
	 *
	 * @since 4.5.0
	 */
	const RENDER_QUERY_VAR = 'wp_customize_render_partials';

	/**
	 * Plugin directory URL.
	 *
	 * This is irrelevant to #coremerge.
	 *
	 * @var string
	 */
	public $dir_url = '';

	/**
	 * Customize manager.
	 *
	 * @var WP_Customize_Manager
	 */
	public $manager;

	/**
	 * Selective refresh for nav menus.
	 *
	 * This will be integrated into WP_Customize_Nav_Menus in #coremerge.
	 *
	 * @var WP_Customize_Nav_Menus_Partial_Refresh
	 */
	public $nav_menus;

	/**
	 * Selective refresh for widgets.
	 *
	 * This will be integrated into WP_Customize_Widgets in #coremerge.
	 *
	 * @var WP_Customize_Widgets_Partial_Refresh
	 */
	public $widgets;

	/**
	 * Plugin bootstrap for Partial Refresh functionality.
	 *
	 * @since 4.5.0
	 *
	 * @param WP_Customize_Manager $manager Manager.
	 */
	public function __construct( WP_Customize_Manager $manager ) {
		$this->dir_url = plugin_dir_url( dirname( __FILE__ ) ); /* Not relevant to #coremerge */

		$this->manager = $manager;

		add_action( 'customize_controls_print_footer_scripts', array( $this, 'enqueue_pane_scripts' ) );
		add_action( 'customize_preview_init', array( $this, 'init_preview' ) );

		add_action( 'wp_default_scripts', array( $this, 'register_scripts' ), 11 );
		add_action( 'wp_default_styles', array( $this, 'register_styles' ), 11 );
	}

	/**
	 * Get version.
	 *
	 * Not relevant to #coremerge.
	 *
	 * @return string
	 */
	function get_version() {
		return self::VERSION;
	}

	/**
	 * Register scripts.
	 *
	 * This will be moved to script-loader.php in #coremerge.
	 *
	 * @param WP_Scripts $wp_scripts Scripts.
	 */
	function register_scripts( $wp_scripts ) {
		$handle = 'customize-partial-refresh-pane';
		$src = $this->dir_url . 'js/customize-partial-refresh-pane.js';
		$deps = array( 'customize-controls', 'jquery', 'wp-util' );
		$in_footer = true;
		$wp_scripts->add( $handle, $src, $deps, $this->get_version(), $in_footer );

		$handle = 'customize-widgets-hacks';
		$src = $this->dir_url . 'js/customize-widgets-hacks.js';
		$deps = array( 'customize-widgets' );
		$in_footer = true;
		$wp_scripts->add( $handle, $src, $deps, $this->get_version(), $in_footer );

		$handle = 'customize-partial-refresh-preview';
		$src = $this->dir_url . 'js/customize-partial-refresh-preview.js';
		$deps = array( 'customize-preview', 'wp-util' );
		$in_footer = true;
		$wp_scripts->add( $handle, $src, $deps, $this->get_version(), $in_footer );

		$handle = 'customize-preview-nav-menus';
		$src = $this->dir_url . 'js/customize-preview-nav-menus.js';
		$deps = array( 'customize-preview', 'customize-partial-refresh-preview' );
		$in_footer = true;
		$wp_scripts->remove( $handle );
		$wp_scripts->add( $handle, $src, $deps, $this->get_version(), $in_footer );

		$handle = 'customize-preview-widgets';
		$src = $this->dir_url . 'js/customize-preview-widgets.js';
		$deps = array( 'customize-preview', 'customize-partial-refresh-preview' );
		$in_footer = true;
		$wp_scripts->remove( $handle );
		$wp_scripts->add( $handle, $src, $deps, $this->get_version(), $in_footer );
	}

	/**
	 * Register styles.
	 *
	 * This will be moved to script-loader.php in the #coremerge.
	 *
	 * @param WP_Styles $wp_styles Styles.
	 */
	function register_styles( $wp_styles ) {
		$handle = 'customize-partial-refresh-widgets-preview';
		$src = $this->dir_url . 'css/customize-partial-refresh-widgets-preview.css';
		$deps = array( 'customize-preview' );
		$wp_styles->add( $handle, $src, $deps, $this->get_version() );
	}

	/**
	 * Registered instances of WP_Customize_Partial.
	 *
	 * @since 4.5.0
	 * @access protected
	 * @var WP_Customize_Partial[]
	 */
	protected $partials = array();

	/**
	 * Get the registered partials.
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

			$partial = new $class( $this, $id, $args );
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
		wp_enqueue_script( 'customize-partial-refresh-pane' );
	}

	/**
	 * Enqueue preview scripts.
	 *
	 * @since 4.5.0
	 * @access public
	 */
	public function enqueue_preview_scripts() {
		wp_enqueue_script( 'customize-partial-refresh-preview' );
		$wp_scripts = wp_scripts();
		$wp_styles = wp_styles();

		/*
		 * Core does not rebuild MediaElement.js audio and video players when DOM subtrees change.
		 * The Jetpack Infinite Scroll handles this when a post-load event is triggered.
		 * Ideally this should be incorporated into Core.
		 *
		 * Hard-coded reference to a Jetpack module's event is not relevant for #coremerge.
		 */
		if ( class_exists( 'Jetpack' ) ) {
			$exports = array();
			$handle = 'customize-partial-jetpack-support';
			$src = $this->dir_url . 'js/plugin-support/jetpack.js';
			$deps = array( 'customize-partial-refresh-preview' );
			$in_footer = true;
			wp_enqueue_script( $handle, $src, $deps, $this->get_version(), $in_footer );

			if ( Jetpack::is_module_active( 'infinite-scroll' ) ) {
				$exports['infiniteScroll'] = array(
					'themeSupport' => current_theme_supports( 'infinite-scroll' ),
				);
			}

			if ( Jetpack::is_module( 'widgets' ) ) {
				$exports['widgets'] = array(
					'scripts' => array(
						'google-maps' => array(
							'src' => 'https://maps.googleapis.com/maps/api/js?sensor=false',
						),
						'contact-info-map-js' => array(
							'src' => plugins_url( 'modules/widgets/contact-info/contact-info-map.js', JETPACK__PLUGIN_FILE ),
							'deps' => array( 'jquery', 'google-maps' ),
						),
					),
					'styles' => array(
						'contact-info-map-css' => array(
							'src' => plugins_url( 'modules/widgets/contact-info/contact-info-map.css', JETPACK__PLUGIN_FILE ),
						),
					),
				);
			}

			wp_scripts()->add_data( $handle, 'data', sprintf( 'var _customizeSelectiveRefreshJetpackExports = %s;', wp_json_encode( $exports ) ) );
		}

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
		echo sprintf( '<script>var _customizePartialRefreshExports = %s;</script>', wp_json_encode( $exports ) );
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

			$partial = new $partial_class( $this, $partial_id, $partial_args );

			$this->add_partial( $partial );
			$new_partials[] = $partial;
		}
		return $new_partials;
	}

	/**
	 * Check whether the request is for rendering partials.
	 *
	 * Note that this will not consider whether the request is authorized or valid,
	 * just that essentially the route is a match.
	 *
	 * @since 4.5.0
	 * @access public
	 *
	 * @return bool Whether the request is for rendering partials.
	 */
	public function is_render_partials_request() {
		return ! empty( $_POST[ self::RENDER_QUERY_VAR ] );
	}

	/**
	 * Log of errors triggered when partials are rendered.
	 *
	 * @since 4.5.0
	 * @access private
	 * @var array
	 */
	protected $triggered_errors = array();

	/**
	 * Keep track of the current partial being rendered.
	 *
	 * @since 4.5.0
	 * @access private
	 * @var string
	 */
	protected $current_partial_id;

	/**
	 * Handle PHP error triggered during rendering the partials.
	 *
	 * These errors will be relayed back to the client in the Ajax response.
	 *
	 * @since 4.5.0
	 * @access private
	 *
	 * @param int    $errno   Error number.
	 * @param string $errstr  Error string.
	 * @param string $errfile Error file.
	 * @param string $errline Error line.
	 * @return bool
	 */
	public function handle_error( $errno, $errstr, $errfile = null, $errline = null ) {
		$this->triggered_errors[] = array(
			'partial' => $this->current_partial_id,
			'error_number' => $errno,
			'error_string' => $errstr,
			'error_file' => $errfile,
			'error_line' => $errline,
		);
		return true;
	}

	/**
	 * Handle Ajax request to return the settings partial value.
	 *
	 * @since 4.5.0
	 * @access public
	 */
	public function handle_render_partials_request() {
		if ( ! $this->is_render_partials_request() ) {
			return;
		}

		$this->manager->remove_preview_signature();

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

		/**
		 * Do setup before rendering each partial.
		 *
		 * Plugins may do things like wp_enqueue_scripts() to gather a list of
		 * the scripts and styles which may get enqueued in the response.
		 *
		 * @todo Eventually this should automatically by default do wp_enqueue_scripts(). See below.
		 *
		 * @since 4.5.0
		 *
		 * @param WP_Customize_Selective_Refresh $this Selective refresh component.
		 */
		do_action( 'customize_render_partials_before', $this );

		set_error_handler( array( $this, 'handle_error' ), error_reporting() );
		$contents = array();
		foreach ( $partials as $partial_id => $container_contexts ) {
			$this->current_partial_id = $partial_id;
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
		$this->current_partial_id = null;
		restore_error_handler();

		$response = array(
			'contents' => $contents,
		);
		if ( defined( 'WP_DEBUG_DISPLAY' ) && WP_DEBUG_DISPLAY ) {
			$response['errors'] = $this->triggered_errors;
		}

		/**
		 * Filter the response from rendering the partials.
		 *
		 * This is similar to the <code>infinite_scroll_results</code> filter in Jetpack,
		 * and the <code>The_Neverending_Home_Page::filter_infinite_scroll_results()</code>
		 * function which will amend the response with scripts and styles that are enqueued
		 * so that the client can inject these new dependencies into the document.
		 *
		 * @todo This method should eventually go ahead and include the enqueued scripts and styles by default. Beware of any sripts that do document.write().
		 *
		 * @since 4.5.0
		 *
		 * @param array $response {
		 *     Response.
		 *
		 *     @type array $contents  Associative array mapping a partial ID its corresponding array of contents for the containers requested.
		 *     @type array [$errors]  List of errors triggered during rendering of partials, if WP_DEBUG_DISPLAY is enabled.
		 * }
		 *
		 * @param WP_Customize_Selective_Refresh $this Selective refresh component.
		 */
		$response = apply_filters( 'customize_render_partials_response', $response, $this );

		wp_send_json_success( $response );
	}
}
