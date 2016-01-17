/* global jQuery */
/* exported customizeSelectiveRefreshPreview */
var customizeSelectiveRefreshPreview = ( function( $, api ) {
	'use strict';

	var self = {};

	api.bind( 'preview-ready', function() {

		api.preview.bind( 'selective-refreshing', function( args ) {
			$( args.selector ).addClass( 'customize-partial-refreshing' );
		} );

		api.preview.bind( 'selective-refreshed', function( args ) {
			var elements = $( args.selector );
			if ( 0 === elements.length ) {
				api.preview.send( 'refresh' );
			} else {
				elements.each( function() {
					$( this ).html( args.partial ).removeClass( 'customize-partial-refreshing' );
				} );
			}
		} );
	} );

	return self;
}( jQuery, wp.customize ) );
