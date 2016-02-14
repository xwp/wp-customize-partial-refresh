/*global jQuery, wp */
jQuery( function( $ ) {
	wp.customize.bind( 'sidebar-updated', function( sidebarPartial ) {
		var widgetArea;
		if ( 'sidebar-1' === sidebarPartial.sidebarId && $.isFunction( $.fn.masonry ) ) {
			widgetArea = $( '#secondary .widget-area' );
			widgetArea.masonry( 'destroy' );
			widgetArea.masonry();
		}
	} );
} );
