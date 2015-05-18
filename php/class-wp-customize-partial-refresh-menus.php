<?php

class WP_Customize_Partial_Refresh_Menus {
	const THEME_SUPPORT = 'customize-partial-refresh-menus';
	const RENDER_AJAX_ACTION = 'customize_render_menu_partial';
	const RENDER_NONCE_POST_KEY = 'render-menu-nonce';
	const RENDER_QUERY_VAR = 'wp_customize_partial_refresh_menu_render';

	/**
	 * @var WP_Customize_Partial_Refresh_Plugin
	 */
	public $plugin;

	/**
	 * Nav menu args used for each instance.
	 *
	 * @var array[]
	 */
	public $nav_menu_instance_args = array();

	/**
	 * @var int
	 */
	public $instance_number = 0;

	/**
	 * All of these themes get the theme support automatically at after_setup_theme.
	 *
	 * @var array
	 */
	protected $builtin_themes = array(
		'tewntyten',
		'tewntyeleven',
		'tewntytwelve',
		'twentythirteen',
		'twentyfourteen',
		'twentyfifteen',
	);

	/**
	 * @param WP_Customize_Partial_Refresh_Plugin $plugin
	 */
	function __construct( WP_Customize_Partial_Refresh_Plugin $plugin ) {
		$this->plugin = $plugin;
		add_action( 'after_setup_theme', array( $this, 'add_builtin_theme_support' ) );
		add_action( 'init', array( $this, 'init' ) );
	}

	/**
	 * Do add_theme_support() for any built-in supported theme; other themes need to do this themselves
	 *
	 * @action after_setup_theme
	 */
	function add_builtin_theme_support() {
		$is_builtin_supported = (
			in_array( get_stylesheet(), $this->builtin_themes )
			||
			in_array( get_template(), $this->builtin_themes )
		);
		if ( $is_builtin_supported ) {
			add_theme_support( self::THEME_SUPPORT );
		}
	}

	/**
	 * @action init
	 */
	function init() {
		if ( ! current_theme_supports( self::THEME_SUPPORT ) ) {
			return;
		}
		add_filter( 'temp_menu_customizer_previewable_setting_transport', array( $this, 'filter_temp_menu_customizer_previewable_setting_transport' ) );
		add_action( 'customize_controls_enqueue_scripts', array( $this, 'customize_controls_enqueue_scripts' ) );
		add_action( 'customize_preview_init', array( $this, 'customize_preview_init' ) );
	}

	/**
	 * Ensure that Menu Customizer creates settings with postMessage transport.
	 *
	 * @return string
	 */
	function filter_temp_menu_customizer_previewable_setting_transport() {
		return 'postMessage';
	}

	/**
	 * @param string $menu_location
	 * @return bool
	 */
	function is_menu_location_partial_refreshable( $menu_location ) {
		$partial_refreshable = true;
		$partial_refreshable = apply_filters( 'customize_menu_location_partial_refreshable', $partial_refreshable, $menu_location );
		$partial_refreshable = apply_filters( "customize_menu_location_partial_refreshable_{$menu_location}", $partial_refreshable );
		return $partial_refreshable;
	}

	/**
	 * @action customize_preview_init
	 */
	function customize_preview_init() {
		add_action( 'template_redirect', array( $this, 'render_menu' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'customize_preview_enqueue_deps' ) );
		if ( ! isset( $_REQUEST[ self::RENDER_QUERY_VAR ] ) ) { // wpcs: input var ok
			add_filter( 'wp_nav_menu', array( $this, 'filter_wp_nav_menu' ), 10, 2 );
		}
	}

	/**
	 * Add scripts for customizing the Customizer pane
	 */
	function customize_controls_enqueue_scripts() {
		/**
		 * @var WP_Scripts $wp_scripts
		 */
		global $wp_scripts;

		wp_enqueue_script( $this->plugin->script_handles['menus-pane'] );

		$exports = array();
		$wp_scripts->add_data(
			$this->plugin->script_handles['menus-pane'],
			'data',
			sprintf( 'var _wpCustomizePartialRefreshMenusExports = %s;', json_encode( $exports ) )
		);
	}

	/**
	 * Filter whether to short-circuit the wp_nav_menu() output.
	 *
	 * @see wp_nav_menu()
	 *
	 * @param string $nav_menu_content The HTML content for the navigation menu.
	 * @param object $args     An object containing wp_nav_menu() arguments.
	 * @return null
	 */
	function filter_wp_nav_menu( $nav_menu_content, $args ) {
		$this->instance_number += 1;

		// Get the nav menu based on the requested menu
		$nav_menu = wp_get_nav_menu_object( $args->menu );

		// Get the nav menu based on the theme_location
		if ( ! $nav_menu && $args->theme_location && ( $locations = get_nav_menu_locations() ) && isset( $locations[ $args->theme_location ] ) ) {
			$nav_menu = wp_get_nav_menu_object( $locations[ $args->theme_location ] );
		}

		// get the first menu that has items if we still can't find a menu
		if ( ! $nav_menu && ! $args->theme_location ) {
			$menus = wp_get_nav_menus();
			foreach ( $menus as $menu_maybe ) {
				if ( $menu_items = wp_get_nav_menu_items( $menu_maybe->term_id, array( 'update_post_term_cache' => false ) ) ) {
					$nav_menu = $menu_maybe;
					break;
				}
			}
		}

		if ( $nav_menu ) {
			$exported_args = get_object_vars( $args );
			unset( $exported_args['fallback_cb'] ); // this could be a closure which would blow things up, so remove
			unset( $exported_args['echo'] );
			$exported_args['menu'] = $nav_menu->term_id; // eliminate location-based and slug-based calls
			ksort( $exported_args );
			$exported_args['args_hash'] = $this->hash_nav_menu_args( $exported_args );
			$this->nav_menu_instance_args[ $this->instance_number ] = $exported_args;
			$nav_menu_content = sprintf( '<div id="partial-refresh-menu-container-%1$d" class="partial-refresh-menu-container" data-instance-number="%1$d">%2$s</div>', $this->instance_number, $nav_menu_content );
		}

		return $nav_menu_content;
	}

	/**
	 * Hash (hmac) the arguments with the nonce and secret auth key to ensure they
	 * are not tampered with when submitted in the Ajax request.
	 *
	 * @param array $args
	 * @return string
	 */
	function hash_nav_menu_args( $args ) {
		return wp_hash( wp_create_nonce( 'RENDER_AJAX_ACTION' ) . serialize( $args ) );
	}

	/**
	 * @action wp_enqueue_scripts
	 */
	function customize_preview_enqueue_deps() {
		wp_enqueue_script( $this->plugin->script_handles['menus-preview'] );
		wp_enqueue_style( $this->plugin->style_handles['preview'] );

		add_action( 'wp_print_footer_scripts', array( $this, 'export_preview_data' ) );
	}

	/**
	 * Export data from PHP to JS.
	 *
	 * @action wp_print_footer_scripts
	 */
	function export_preview_data() {

		/** @var WP_Customize_Manager $wp_customize */
		global $wp_customize;

		// Why not wp_localize_script? Because we're not localizing, and it forces values into strings
		$exports = array(
			'renderQueryVar' => self::RENDER_QUERY_VAR,
			'renderNonceValue' => wp_create_nonce( self::RENDER_AJAX_ACTION ),
			'renderNoncePostKey' => self::RENDER_NONCE_POST_KEY,
			'requestUri' => '/',
			'theme' => array(
				'stylesheet' => $wp_customize->get_stylesheet(),
				'active'     => $wp_customize->is_theme_active(),
			),
			'previewCustomizeNonce' => wp_create_nonce( 'preview-customize_' . $wp_customize->get_stylesheet() ),
			'navMenuInstanceArgs' => $this->nav_menu_instance_args,
		);
		if ( ! empty( $_SERVER['REQUEST_URI'] ) ) { // input var okay
			$exports['requestUri'] = esc_url_raw( home_url( wp_unslash( $_SERVER['REQUEST_URI'] ) ) ); // input var okay; sanitization okay
		}
		printf( '<script>var _wpCustomizePartialRefreshMenusExports = %s;</script>', wp_json_encode( $exports ) );
	}

	/**
	 * @see dynamic_sidebar()
	 * @action template_redirect
	 */
	function render_menu() {
		/**
		 * @var WP_Customize_Manager $wp_customize
		 */
		global $wp_customize;

		if ( empty( $_POST[ self::RENDER_QUERY_VAR ] ) || empty( $wp_customize ) ) { // wpcs: input var okay
			return;
		}

		$generic_error = __( 'An error has occurred. Please reload the page and try again.', 'customize-partial-preview-refresh' );
		try {
			$wp_customize->remove_preview_signature();

			if ( empty( $_POST[ self::RENDER_NONCE_POST_KEY ] ) ) { // wpcs: input var okay
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Missing nonce param', 'customize-partial-preview-refresh' ) );
			}
			if ( ! is_customize_preview() ) {
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Expected customizer preview', 'customize-partial-preview-refresh' ) );
			}
			if ( ! check_ajax_referer( self::RENDER_AJAX_ACTION, self::RENDER_NONCE_POST_KEY, false ) ) {
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Nonce check failed. Reload and try again?', 'customize-partial-preview-refresh' ) );
			}
			if ( ! current_user_can( 'edit_theme_options' ) ) {
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Current user cannot!', 'customize-partial-preview-refresh' ) );
			}
			if ( ! isset( $_POST['wp_nav_menu_args'] ) ) { // wpcs: input var okay
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Missing wp_nav_menu_args param', 'customize-partial-preview-refresh' ) );
			}
			if ( ! isset( $_POST['wp_nav_menu_args_hash'] ) ) { // wpcs: input var okay
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Missing wp_nav_menu_args_hash param', 'customize-partial-preview-refresh' ) );
			}
			$wp_nav_menu_args_hash = wp_unslash( sanitize_text_field( $_POST['wp_nav_menu_args_hash'] ) ); // wpcs: input var ok
			$wp_nav_menu_args = json_decode( wp_unslash( $_POST['wp_nav_menu_args'] ), true ); // wpcs: input var ok; sanitization ok
			if ( json_last_error() ) {
				throw new WP_Customize_Partial_Refresh_Exception( sprintf( __( 'JSON Error: %s', 'customize-partial-preview-refresh' ), json_last_error() ) );
			}
			if ( ! is_array( $wp_nav_menu_args ) ) {
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Expected wp_nav_menu_args to be an array', 'customize-partial-preview-refresh' ) );
			}
			if ( $this->hash_nav_menu_args( $wp_nav_menu_args ) !== $wp_nav_menu_args_hash ) {
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Supplied wp_nav_menu_args does not hash to be wp_nav_menu_args_hash', 'customize-partial-preview-refresh' ) );
			}

			$wp_nav_menu_args['echo'] = false;
			wp_send_json_success( wp_nav_menu( $wp_nav_menu_args ) );
		} catch ( Exception $e ) {
			if ( $e instanceof WP_Customize_Partial_Refresh_Exception && ( defined( 'WP_DEBUG' ) && WP_DEBUG ) ) {
				$message = $e->getMessage();
			} else {
				if ( ! $this->plugin->is_wpcom_vip_prod() ) {
					trigger_error( esc_html( sprintf( '%s in %s: %s', get_class( $e ), __FUNCTION__, $e->getMessage() ) ), E_USER_WARNING );
				}
				$message = $generic_error;
			}
			wp_send_json_error( compact( 'message' ) );
		}
	}

}
