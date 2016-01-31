/* global jQuery, wp */
( function( $, api ) {
	'use strict';

	// Propagate saved event to preview.
	// @todo Remove this once #35616 is committed to Core.
	api.bind( 'ready', function() {
		api.bind( 'saved', function( data ) {
			api.previewer.send( 'saved', data );
		} );
	} );

	// @todo Remove this once #35617 is committed to Core.
	api.bind( 'nonce-refresh', function( nonce ) {
		api.previewer.send( 'nonce-refresh', nonce );
	});

}( jQuery, wp.customize ) );
