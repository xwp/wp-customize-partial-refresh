/*global jQuery, wp */
jQuery( function( $ ) {
	wp.customize.bind( 'sidebar-updated', function( sidebarId ) {
		var widgetArea;
		if ( 'sidebar-1' === sidebarId && $.isFunction( $.fn.masonry ) ) {
			widgetArea = $( '#secondary .widget-area' );
			widgetArea.masonry( 'reloadItems' );
			widgetArea.masonry();
		}
	} );
} );
