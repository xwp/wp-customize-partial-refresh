wp.customize.navMenusPreview = wp.customize.MenusCustomizerPreview = ( function( $, _, wp, api ) {
	'use strict';

	var self = {};

	/**
	 * Initialize nav menus preview.
	 */
	self.init = function() {
		var self = this;
		self.addPartials();

		self.watchNavMenuLocationChanges();

		api.preview.bind( 'active', function() {
			self.highlightControls();
		} );

		// @todo Move this up.
		self.mutationObserver = new MutationObserver( function( mutations ) {
			_.each( mutations, function( mutation ) {
				self.addPartials( mutation.target );
			} );
		} );
		self.mutationObserver.observe( document.body, {
			childList: true,
			subtree: true
		} );
	};

	/**
	 * Partial representing an invocation of wp_nav_menu().
	 *
	 * @class
	 * @augments wp.customize.Partial
	 * @since 4.5.0
	 */
	self.NavMenuPlacementPartial = api.Partial.extend({

		/**
		 * Constructor.
		 *
		 * @since 4.5.0
		 * @param {string} id - Partial ID.
		 * @param {Object} options
		 * @param {Object} options.params
		 * @param {jQuery} options.params.containerElement
		 * @param {Object} options.params.navMenuArgs
		 * @param {string} options.params.navMenuArgs.args_hmac
		 * @param {string} [options.params.navMenuArgs.theme_location]
		 * @param {number} [options.params.navMenuArgs.menu]
		 */
		initialize: function( id, options ) {
			var partial = this, matches, argsHmac;
			matches = id.match( /^nav_menu_placement\[([0-9a-f]{32})]$/ );
			if ( ! matches ) {
				throw new Error( 'Illegal id for nav_menu_placement partial. The key corresponds with the args HMAC.' );
			}
			argsHmac = matches[1];

			options = options || {};
			options.params = _.extend(
				{
					selector: '[data-customize-partial-id="' + id + '"]',
					navMenuArgs: {},
					containerInclusive: true
				},
				options.params || {}
			);
			api.Partial.prototype.initialize.call( partial, id, options );

			if ( ! _.isObject( partial.params.navMenuArgs ) ) {
				throw new Error( 'Missing navMenuArgs' );
			}
			if ( partial.params.navMenuArgs.args_hmac !== argsHmac ) {
				throw new Error( 'args_hmac mismatch with id' );
			}
		},

		/**
		 * Return whether the setting is related to this partial.
		 *
		 * @since 4.5.0
		 * @param {wp.customize.Value|string} setting  - Object or ID.
		 * @param {number|object|false|null}  newValue - New value, or null if the setting was just removed.
		 * @param {number|object|false|null}  oldValue - Old value, or null if the setting was just added.
		 * @returns {boolean}
		 */
		isRelatedSetting: function( setting, newValue, oldValue ) {
			var partial = this, navMenuLocationSetting, navMenuId;
			if ( _.isString( setting ) ) {
				setting = api( setting );
			}

			if ( partial.params.navMenuArgs.theme_location ) {
				if ( 'nav_menu_locations[' + partial.params.navMenuArgs.theme_location + ']' === setting.id ) {
					return true;
				}
				navMenuLocationSetting = api( 'nav_menu_locations[' + partial.params.navMenuArgs.theme_location + ']' );
			}

			navMenuId = partial.params.navMenuArgs.menu;
			if ( ! navMenuId && navMenuLocationSetting ) {
				navMenuId = navMenuLocationSetting();
			}

			if ( ! navMenuId ) {
				return false;
			}
			return (
				( 'nav_menu[' + navMenuId + ']' === setting.id ) ||
				( /^nav_menu_item\[/.test( setting.id ) &&
					( ( newValue && newValue.nav_menu_term_id === navMenuId ) || ( oldValue && oldValue.nav_menu_term_id === navMenuId ) )
				)
			);
		},

		/**
		 * Render content.
		 *
		 * @inheritdoc
		 * @param {object} container
		 */
		renderContent: function( container ) {
			var partial = this, previousContainer = container.element;
			if ( api.Partial.prototype.renderContent.call( partial, container ) ) {
				partial.params.containerElement = container.element;

				// Trigger deprecated event.
				// @todo Listen for mutation changes?
				$( document ).trigger( 'customize-preview-menu-refreshed', [ {
					instanceNumber: null, // @deprecated
					wpNavArgs: container.context, // @deprecated
					wpNavMenuArgs: container.context,
					oldContainer: previousContainer,
					newContainer: container.element
				} ] );
			}
		}
	});

	api.partialConstructor.nav_menu_placement = self.NavMenuPlacementPartial;

	/**
	 * Connect nav menu items with their corresponding controls in the pane.
	 *
	 * Setup shift-click on nav menu items which are more granular than the nav menu partial itself.
	 * Also this applies even if a nav menu is not partial-refreshable.
	 *
	 * @since 4.5.0
	 */
	self.highlightControls = function() {
		var selector = '.menu-item';

		// Focus on the menu item control when shift+clicking the menu item.
		$( document ).on( 'click', selector, function( e ) {
			var navMenuItemParts;
			if ( ! e.shiftKey ) {
				return;
			}

			navMenuItemParts = $( this ).attr( 'class' ).match( /(?:^|\s)menu-item-(\d+)(?:\s|$)/ );
			if ( navMenuItemParts ) {
				e.preventDefault();
				e.stopPropagation(); // Make sure a sub-nav menu item will get focused instead of parent items.
				api.preview.send( 'focus-nav-menu-item-control', parseInt( navMenuItemParts[1], 10 ) );
			}
		});
	};

	/**
	 * Add partials for any nav menu container elements in the document.
	 *
	 * This method may be called multiple times. Containers that already have been
	 * seen will be skipped.
	 *
	 * @since 4.5.0
	 *
	 * @todo Move this into root functionality, making it generic.
	 *
	 * @param {jQuery} [rootElement]
	 */
	self.addPartials = function( rootElement ) {
		var containerElements;
		rootElement = $( rootElement || document.body );

		// @todo Genericize.
		containerElements = rootElement.parent().find( '[data-customize-partial-type="nav_menu_placement"][data-customize-partial-id]' );
		containerElements.each( function() {
			var containerElement = $( this ), partial, id, navMenuArgs;
			id = containerElement.data( 'customize-partial-id' );
			navMenuArgs = containerElement.data( 'customize-partial-container-context' );
			if ( ! navMenuArgs || ! navMenuArgs.args_hmac ) {
				throw new Error( 'Missing customize-partial-container-context that includes navMenuArgs and args_hmac' );
			}

			partial = api.partial( id );
			if ( ! partial ) {
				partial = new self.NavMenuPlacementPartial( id, {
					params: {
						navMenuArgs: navMenuArgs
					}
				} );
				api.partial.add( partial.id, partial );
			}
		} );
	};

	/**
	 * Watch for changes to nav_menu_locations[] settings.
	 *
	 * Refresh partials associated with the given nav_menu_locations[] setting,
	 * or request an entire preview refresh if there are no containers in the
	 * document for a partial associated with the theme location.
	 *
	 * @since 4.5.0
	 */
	self.watchNavMenuLocationChanges = function() {
		api.bind( 'change', function( setting ) {
			var themeLocation, themeLocationPartialFound = false, matches = setting.id.match( /^nav_menu_locations\[(.+)]$/ );
			if ( ! matches ) {
				return;
			}
			themeLocation = matches[1];
			api.partial.each( function( partial ) {
				if ( partial.extended( self.NavMenuPlacementPartial ) && partial.params.navMenuArgs.theme_location === themeLocation ) {
					partial.refresh();
					themeLocationPartialFound = true;
				}
			} );

			if ( ! themeLocationPartialFound ) {
				api.selectiveRefreshPreview.requestFullRefresh();
			}
		} );
	};

	api.bind( 'preview-ready', function() {
		self.init();
	} );

	return self;

}( jQuery, _, wp, wp.customize ) );
