<?php

class WP_Customize_Partial_Refresh_Widgets {
	const THEME_SUPPORT = 'customize-partial-refresh-widgets';
	const RENDER_WIDGET_AJAX_ACTION = 'render_widget';
	const RENDER_WIDGET_NONCE_POST_KEY = 'render-sidebar-widgets-nonce';
	const RENDER_WIDGET_QUERY_VAR = 'wp_customize_partial_refresh_widget_render';

	/**
	 * @var WP_Customize_Partial_Refresh_Plugin
	 */
	public $plugin;

	public $core_widget_base_ids = array(
		'archives',
		'calendar',
		'categories',
		'links',
		'meta',
		'nav_menu',
		'pages',
		'recent-comments',
		'recent-posts',
		'rss',
		'search',
		'tag_cloud',
		'text',
	);

	/**
	 * If an array key is present, the theme is supported. If the value is true,
	 * then there is an associated script that needs to be enqueued in the
	 * preview.
	 *
	 * @var array
	 */
	protected $builtin_themes_needing_helper_scripts = array(
		'twentyten' => false,
		'twentyeleven' => false,
		'twentytwelve' => false,
		'twentythirteen' => true,
		'twentyfourteen' => false,
		'twentyfifteen' => false,
	);

	function __construct( WP_Customize_Partial_Refresh_Plugin $plugin ) {
		$this->plugin = $plugin;
		$this->add_builtin_theme_support();
		add_action( 'after_setup_theme', array( $this, 'init' ), 1 );
	}

	/**
	 * @action after_setup_theme
	 */
	function init() {
		if ( ! current_theme_supports( self::THEME_SUPPORT ) ) {
			return;
		}
		add_filter( 'widget_customizer_setting_args', array( $this, 'filter_widget_customizer_setting_args' ), 10, 2 );
		add_action( 'customize_controls_enqueue_scripts', array( $this, 'customize_controls_enqueue_scripts' ) );
		add_action( 'customize_preview_init', array( $this, 'customize_preview_init' ) );
	}

	/**
	 * Do add_theme_support() for any built-in supported theme; other themes need to do this themselves
	 * @action after_setup_theme
	 */
	function add_builtin_theme_support() {
		$is_builtin_supported = (
			isset( $this->builtin_themes_needing_helper_scripts[ get_stylesheet() ] )
			||
			isset( $this->builtin_themes_needing_helper_scripts[ get_template() ] )
		);
		if ( $is_builtin_supported ) {
			add_theme_support( self::THEME_SUPPORT );
		}
	}

	/**
	 * @param string $id_base
	 * @return bool
	 */
	function is_widget_partial_refreshable( $id_base) {
		$partial_refreshable = false;
		if ( in_array( $id_base, $this->core_widget_base_ids ) ) {
			$partial_refreshable = true;
		}
		$partial_refreshable = apply_filters( 'customize_widget_partial_refreshable', $partial_refreshable, $id_base );
		$partial_refreshable = apply_filters( "customize_widget_partial_refreshable_{$id_base}", $partial_refreshable );
		return $partial_refreshable;
	}

	/**
	 * @param string $sidebar_id
	 * @return bool
	 */
	function is_sidebar_partial_refreshable( $sidebar_id ) {
		$partial_refreshable = true;
		$partial_refreshable = apply_filters( 'customize_sidebar_partial_refreshable', $partial_refreshable, $sidebar_id );
		$partial_refreshable = apply_filters( "customize_sidebar_partial_refreshable_{$sidebar_id}", $partial_refreshable );
		return $partial_refreshable;
	}


	/**
	 * @param array $args
	 * @param string $setting_id
	 *
	 * @return array
	 */
	function filter_widget_customizer_setting_args( $args, $setting_id ) {
		if ( preg_match( '/^widget_(?P<id_base>.+?)\[(?P<number>\d+)\]/', $setting_id, $matches ) ) {
			if ( $this->is_widget_partial_refreshable( $matches['id_base'] ) ) {
				$args['transport'] = 'postMessage';
			}
		} else if ( preg_match( '/^sidebars_widgets\[(?P<sidebar_id>.+?)\]$/', $setting_id, $matches ) ) {
			if ( 'wp_inactive_widgets' === $matches['sidebar_id'] ) {
				$setting_args['transport'] = 'postMessage'; // prevent refresh since not rendered anyway
			}
		}
		return $args;
	}

	/**
	 * @action customize_preview_init
	 */
	function customize_preview_init() {
		add_action( 'template_redirect', array( $this, 'render_widget' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'customize_preview_enqueue_deps' ) );
	}

	/**
	 * @return array
	 */
	function get_all_widget_id_bases() {
		global $wp_registered_widgets, $wp_registered_widget_controls;

		$all_id_bases = array();
		foreach ( $wp_registered_widgets as $widget ) {
			if ( isset( $wp_registered_widget_controls[ $widget['id'] ]['id_base'] ) ) {
				$all_id_bases[] = $wp_registered_widget_controls[ $widget['id'] ]['id_base'];
			} else {
				$all_id_bases[] = $widget['id'];
			}
		}
		$all_id_bases = array_unique( $all_id_bases );
		return $all_id_bases;
	}

	/**
	 * Return id_bases for widgets which support partial refresh
	 *
	 * @return array
	 */
	function get_widgets_supporting_partial_refresh() {
		$supporting_id_bases = array();
		foreach ( $this->get_all_widget_id_bases() as $id_base ) {
			if ( $this->is_widget_partial_refreshable( $id_base ) ) {
				$supporting_id_bases[] = $id_base;
			}
		}
		return $supporting_id_bases;
	}

	/**
	 * @return array mapping of sidebar IDs to arrays of widget IDs contained within each
	 */
	function get_sidebars_widgets() {
		global $wp_registered_sidebars;
		$sidebars_widgets = array_merge(
			array( 'wp_inactive_widgets' => array() ),
			array_fill_keys( array_keys( $wp_registered_sidebars ), array() ),
			wp_get_sidebars_widgets()
		);
		return $sidebars_widgets;
	}

	/**
	 * @return array sidebar IDs
	 */
	function get_sidebars_supporting_partial_refresh() {
		global $wp_registered_sidebars;
		$supporting_sidebar_ids = array();

		$sidebars_widgets = $this->get_sidebars_widgets();
		unset( $sidebars_widgets['wp_inactive_widgets'] );

		foreach ( $this->get_sidebars_widgets() as $sidebar_id => $sidebar_widget_ids ) {
			$is_registered_sidebar = isset( $wp_registered_sidebars[ $sidebar_id ] );
			if ( $is_registered_sidebar && $this->is_sidebar_partial_refreshable( $sidebar_id ) ) {
				$supporting_sidebar_ids[] = $sidebar_id;
				// @todo We need to unset this if it turned out that there were no widgets rendered in the sidebar (it was not active)
			}
		}
		return $supporting_sidebar_ids;
	}

	/**
	 * Add scripts for customizing the Customizer pane
	 */
	function customize_controls_enqueue_scripts() {
		/**
		 * @var WP_Scripts $wp_scripts
		 */
		global $wp_scripts;

		wp_enqueue_script( $this->plugin->script_handles['widgets-pane'] );

		// Why not wp_localize_script? Because we're not localizing, and it forces values into strings
		$exports = array(
			'sidebarsEligibleForPostMessage' => $this->get_sidebars_supporting_partial_refresh(),
			'widgetsEligibleForPostMessage' => $this->get_widgets_supporting_partial_refresh(),
		);
		$wp_scripts->add_data(
			$this->plugin->script_handles['widgets-pane'],
			'data',
			sprintf( 'var _wpCustomizePartialRefreshWidgets_exports = %s;', json_encode( $exports ) )
		);
	}

	/**
	 * @action wp_enqueue_scripts
	 */
	function customize_preview_enqueue_deps() {
		/**
		 * @var WP_Customize_Manager $wp_customize
		 * @var WP_Scripts $wp_scripts
		 */
		global $wp_customize, $wp_scripts;

		wp_enqueue_script( $this->plugin->script_handles['widgets-preview'] );
		wp_enqueue_style( $this->plugin->style_handles['widgets-preview'] );

		// Enqueue any scripts provided to add live preview support for builtin themes (e.g. twentythirteen)
		$applied_themes = array( get_template() );
		if ( get_stylesheet() !== get_template() ) {
			$applied_themes[] = get_stylesheet();
		}
		foreach ( $applied_themes as $applied_theme ) {
			if ( ! empty( $this->builtin_themes_needing_helper_scripts[ $applied_theme ] ) ) {
				$handle = "customize-partial-refresh-widgets-$applied_theme";
				$src = $this->plugin->get_dir_url( "js/theme-support/$applied_theme.js" );
				$deps = array( 'customize-preview' );
				$in_footer = true;
				wp_enqueue_script( $handle, $src, $deps, $this->plugin->get_version(), $in_footer );
			}
		}

		// Why not wp_localize_script? Because we're not localizing, and it forces values into strings
		$exports = array(
			'renderWidgetQueryVar' => self::RENDER_WIDGET_QUERY_VAR,
			'renderWidgetNonceValue' => wp_create_nonce( self::RENDER_WIDGET_AJAX_ACTION ),
			'renderWidgetNoncePostKey' => self::RENDER_WIDGET_NONCE_POST_KEY,
			'requestUri' => '/',
			'sidebarsEligibleForPostMessage' => $this->get_sidebars_supporting_partial_refresh(),
			'widgetsEligibleForPostMessage' => $this->get_widgets_supporting_partial_refresh(),
			'theme' => array(
				'stylesheet' => $wp_customize->get_stylesheet(),
				'active'     => $wp_customize->is_theme_active(),
			),
			'previewCustomizeNonce' => wp_create_nonce( 'preview-customize_' . $wp_customize->get_stylesheet() ),
		);
		if ( ! empty( $_SERVER['REQUEST_URI'] ) ) {
			$exports['requestUri'] = esc_url_raw( home_url( wp_unslash( $_SERVER['REQUEST_URI'] ) ) );
		}
		$wp_scripts->add_data(
			$this->plugin->script_handles['widgets-preview'],
			'data',
			sprintf( 'var _wpCustomizePartialRefreshWidgets_exports = %s;', wp_json_encode( $exports ) )
		);
	}

	/**
	 * @see dynamic_sidebar()
	 * @action template_redirect
	 */
	function render_widget() {
		/**
		 * @var WP_Customize_Manager $wp_customize
		 */
		global $wp_customize, $wp_registered_widgets, $wp_registered_sidebars;

		if ( empty( $_POST[ self::RENDER_WIDGET_QUERY_VAR ] ) || empty( $wp_customize ) ) { // wpcs: input var okay
			return;
		}

		$generic_error = __( 'An error has occurred. Please reload the page and try again.', 'customize-partial-preview-refresh' );
		try {
			$wp_customize->remove_preview_signature();

			do_action( 'load-widgets.php' );
			do_action( 'widgets.php' );

			if ( empty( $_POST[ self::RENDER_WIDGET_NONCE_POST_KEY ] ) ) { // wpcs: input var okay
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Missing nonce param', 'customize-partial-preview-refresh' ) );
			}
			if ( ! check_ajax_referer( self::RENDER_WIDGET_AJAX_ACTION, self::RENDER_WIDGET_NONCE_POST_KEY, false ) ) {
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Nonce check failed. Reload and try again?', 'customize-partial-preview-refresh' ) );
			}
			if ( ! current_user_can( 'edit_theme_options' ) ) {
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Current user cannot!', 'customize-partial-preview-refresh' ) );
			}
			if ( empty( $_POST['widget_id'] ) ) { // wpcs: input var okay
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Missing widget_id param', 'customize-partial-preview-refresh' ) );
			}
			$widget_id = wp_unslash( sanitize_text_field( $_POST['widget_id'] ) ); // wpcs: input var okay; sanitize_text_field for WordPress-VIP
			if ( ! array_key_exists( $widget_id, $wp_registered_widgets ) ) {
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Unable to find registered widget', 'customize-partial-preview-refresh' ) );
			}
			$widget = $wp_registered_widgets[ $widget_id ];

			if ( ! array_key_exists( 'sidebar_id', $_POST ) ) { // wpcs: input var okay
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Missing sidebar_id param', 'customize-partial-preview-refresh' ) );
			}
			$sidebar_id = wp_unslash( sanitize_text_field( $_POST['sidebar_id'] ) ); // wpcs: input var okay; sanitize_text_field for WordPress-VIP
			$sidebar = array();
			if ( array_key_exists( $sidebar_id, $wp_registered_sidebars ) ) {
				$sidebar = $wp_registered_sidebars[ $sidebar_id ];
			}

			/**
			 * Allow plugins to override the sidebar args.
			 *
			 * @param array $sidebar
			 * @param string $sidebar_id
			 */
			$sidebar = apply_filters( 'customize_partial_refresh_sidebar_args', $sidebar, $sidebar_id );
			if ( empty( $sidebar ) ) {
				throw new WP_Customize_Partial_Refresh_Exception( sprintf( __( 'Attempted to render widget %1$s onto unknown sidebar %2$s.', 'customize-partial-preview-refresh' ), $widget_id, $sidebar_id ) );
			}

			$rendered_widget = null;
			$sidebar = $wp_registered_sidebars[ $sidebar_id ];
			$widget_name = $widget['name'];
			$params = array_merge(
				array( array_merge( $sidebar, compact( 'widget_id', 'widget_name' ) ) ),
				(array) $widget['params']
			);

			$callback = $widget['callback'];
			if ( ! is_array( $callback ) || ! ( $callback[0] instanceof WP_Widget ) ) {
				throw new WP_Customize_Partial_Refresh_Exception( __( 'Only Widgets 2.0 are supported. Old single widgets are not.', 'customize-partial-preview-refresh' ) );
			}

			// Substitute HTML id and class attributes into before_widget
			$class_name = '';
			foreach ( (array) $widget['classname'] as $cn ) {
				if ( is_string( $cn ) ) {
					$class_name .= '_' . $cn;
				} else if ( is_object( $cn ) ) {
					$class_name .= '_' . get_class( $cn );
				}
			}
			$class_name = ltrim( $class_name, '_' );

			$params[0]['before_widget'] = sprintf( $params[0]['before_widget'], $widget_id, $class_name );
			$params = apply_filters( 'dynamic_sidebar_params', $params );

			$other_rendered_widget_ids = array();
			add_action( 'dynamic_sidebar', function ( $widget ) use ( &$other_rendered_widget_ids, $widget_id ) {
				if ( $widget_id !== $widget['id'] ) {
					$other_rendered_widget_ids[] = $widget['id'];
				}
			} );

			// Render the widget
			ob_start();
			do_action( 'dynamic_sidebar', $widget );
			if ( is_callable( $callback ) ) {
				call_user_func_array( $callback, $params );
			}
			$rendered_widget = ob_get_clean();
			wp_send_json_success( compact( 'rendered_widget', 'sidebar_id', 'other_rendered_widget_ids' ) );
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
