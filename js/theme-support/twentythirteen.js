/*global jQuery, wp */
jQuery( function ( $ ) {
	wp.customize.bind( 'sidebar-updated', function ( sidebar_id ) {
		if ( 'sidebar-1' === sidebar_id && $.isFunction( $.fn.masonry ) ) {
			var widgetArea = $( '#secondary .widget-area' );
			widgetArea.masonry( 'reloadItems' );
			widgetArea.masonry();
		}
	} );
} );
