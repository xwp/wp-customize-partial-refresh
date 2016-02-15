window.wp = window.wp || {};
window.wp.customize = window.wp.customize || { get: function(){} };

window._wpCustomizeSettings = {
	'theme': {
		'stylesheet': 'twentyfifteen',
		'active': true
	},
	'url': {
		'self': '\/'
	},
	'channel': 'preview-0',
	'activePanels': {
		'fixture-panel': true
	},
	'activeSections': {
		'fixture-section': true
	},
	'activeControls': {
		'fixture-control': true
	},
	'nonce': {
		'save': '',
		'preview': '',
		'update-widget': '',
		'customize-menus': ''
	},
	'_dirty': []
};

window._wpCustomizeSettings.values = {};
( function( v ) {
	v['fixture-control'] = 'Lorem Ipsum';
})( window._wpCustomizeSettings.values );
