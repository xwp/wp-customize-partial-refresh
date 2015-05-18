/*global jQuery, _wpCustomizePartialRefreshMenusExports */

if ( ! wp.customize.partialPreviewMenus ) {
	wp.customize.partialPreviewMenus = {};
}

wp.customize.partialPreviewMenus.pane = ( function ( $, api ) {
	'use strict';

	var self = {
		ready: $.Deferred()
	};

	$.extend( self, _wpCustomizePartialRefreshMenusExports );

	self.init = function () {
		// @todo We can add stuff here if we need
	};

	self.ready.done( function () {
		self.init();
	} );

	api.bind( 'ready', function () {
		self.ready.resolve();
	} );

	self.init();

	return self;
}( jQuery, wp.customize ));

