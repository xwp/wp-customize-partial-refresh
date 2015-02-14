/*global jQuery, _wpCustomizePartialRefreshWidgets_exports */
wp.customize.partialPreviewWidgets = ( function ( $, api ) {
	'use strict';

	var self = {
		sidebarsEligibleForPostMessage: [],
		widgetsEligibleForPostMessage: [],
		ready: $.Deferred()
	};

	$.extend( self, _wpCustomizePartialRefreshWidgets_exports );

	self.init = function () {

		api.bind( 'add', function ( setting ) {
			var matches, id_base;
			matches = setting.id.match( /^widget_(.+?)\[(\d+)\]$/ );
			if ( ! matches ) {
				return;
			}
			id_base = matches[1];
			if ( -1 !== self.widgetsEligibleForPostMessage.indexOf( id_base ) ) {
				setting.transport = 'postMessage';
			}
		} );
	};

	api.bind( 'ready', function () {
		self.ready.resolve();
	} );

	self.ready.done( function () {
		self.init();
	} );

	return self;
}( jQuery, wp.customize ));

