<?php

class WP_Customize_Partial_Refresh_Widgets {

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

	function __construct( $plugin ) {
		$this->plugin = $plugin;

		// @todo add_theme_support( 'customize-partial-refresh', array( 'widgets' ) )
		// @todo change widget transport
		// @todo When adding a new widget setting, force it to transport=postMessage if the sidebar supports it

		// @todo Upon preview load, change sidebar_widgets settings to use transport=postMessage if the sidebar is active; if not active, change sidebar_widgets setting to transport=refresh
		// @todo All widget settings can have their transport forced to postMessage

		add_filter( 'widget_customizer_setting_args', array( $this, 'filter_widget_customizer_setting_args' ), 10, 2 );
	}

	/**
	 * @param array $args
	 * @param string $setting_id
	 *
	 * @return array
	 */
	function filter_widget_customizer_setting_args( $args, $setting_id ) {
		if ( preg_match( '/^widget_(?P<id_base>.+?)\[(?P<number>\d+)\]/', $setting_id, $matches ) ) {
			$id_base = $matches['id_base'];
			$live_previewable = false;

			if ( in_array( $id_base, $this->core_widget_base_ids ) ) {
				$live_previewable = true;
			}

			// Allow widgets to opt-in for postMessage
			$live_previewable = apply_filters( 'customizer_widget_live_previewable', $live_previewable, $id_base );
			$live_previewable = apply_filters( "customizer_widget_live_previewable_{$id_base}", $live_previewable );

			if ( $live_previewable ) {
				$args['transport'] = 'postMessage';
			}
		}
		return $args;
	}

}
