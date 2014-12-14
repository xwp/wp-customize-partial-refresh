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
		'tewntyten' => false,
		'tewntyeleven' => false,
		'tewntytwelve' => false,
		'twentythirteen' => true,
		'twentyfourteen' => false,
		'twentyfifteen' => false,
	);

	function __construct( WP_Customize_Partial_Refresh_Plugin $plugin ) {
		$this->plugin = $plugin;


		// @todo add_theme_support( 'customize-partial-refresh', array( 'widgets' ) )
		// @todo change widget transport
		// @todo When adding a new widget setting, force it to transport=postMessage if the sidebar supports it

		// @todo Upon preview load, change sidebar_widgets settings to use transport=postMessage if the sidebar is active; if not active, change sidebar_widgets setting to transport=refresh
		// @todo All widget settings can have their transport forced to postMessage

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
	 * @action wp_enqueue_scripts
	 */
	function customize_preview_enqueue_deps() {
		global $wp_registered_sidebars;

		$script_handle = 'customize-partial-refresh-widgets-preview';
		$src = $this->plugin->get_dir_url( 'js/customize-preview-widgets.js' );
		$deps = array( 'jquery', 'wp-util', 'customize-preview' );
		$in_footer = true;
		wp_enqueue_script( $script_handle, $src, $deps, $this->plugin->get_version(), $in_footer );

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
		/**
		 * @var WP_Scripts $wp_scripts
		 */
		global $wp_scripts;
		$exports = array(
			'registered_sidebars' => $wp_registered_sidebars,
			'render_widget_ajax_action' => self::RENDER_WIDGET_AJAX_ACTION,
			'render_widget_nonce_value' => wp_create_nonce( self::RENDER_WIDGET_AJAX_ACTION ),
			'render_widget_nonce_post_key' => self::RENDER_WIDGET_NONCE_POST_KEY,
			'request_uri' => wp_unslash( $_SERVER['REQUEST_URI'] ),
			'sidebars_eligible_for_post_message' => $this->get_sidebars_supporting_partial_refresh(),
			'widgets_eligible_for_post_message' => $this->get_widgets_supporting_partial_refresh(),
		);
		$wp_scripts->add_data(
			$script_handle,
			'data',
			sprintf( 'var _wpCustomizePartialRefreshWidgets_exports = %s;', json_encode( $exports ) )
		);
	}

}
