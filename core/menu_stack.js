/* jslint node: true */
'use strict';

//	ENiGMA½
const loadMenu	= require('./menu_util.js').loadMenu;

//	deps
const _			= require('lodash');
const assert	= require('assert');

//	:TODO: Stack is backwards.... top should be most recent! :)

module.exports = class MenuStack {
	constructor(client) {
		this.client	= client;
		this.stack	= [];
	}

	push(moduleInfo) {
		return this.stack.push(moduleInfo);
	}

	pop() {
		return this.stack.pop();
	}

	peekPrev() {
		if(this.stackSize > 1) {
			return this.stack[this.stack.length - 2];
		}
	}

	top() {
		if(this.stackSize > 0) {
			return this.stack[this.stack.length - 1];
		}
	}

	get stackSize() {
		return this.stack.length;
	}

	get currentModule() {
		const top = this.top();
		if(top) {
			return top.instance;
		}
	}

	next(cb) {
		const currentModuleInfo = this.top();
		assert(currentModuleInfo, 'Empty menu stack!');

		const menuConfig = currentModuleInfo.instance.menuConfig;
		let nextMenu;

		if(_.isArray(menuConfig.next)) {
			nextMenu = this.client.acs.getConditionalValue(menuConfig.next, 'next');
			if(!nextMenu) {
				return cb(new Error('No matching condition for \'next\'!'));
			}
		} else if(_.isString(menuConfig.next)) {
			nextMenu = menuConfig.next;
		} else {
			return cb(new Error('Invalid or missing \'next\' member in menu config!'));
		}

		if(nextMenu === currentModuleInfo.name) {
			return cb(new Error('Menu config \'next\' specifies current menu!'));
		}

		this.goto(nextMenu, { }, cb);
	}

	prev(cb) {
		//	:TODO: leave() should really take a cb...
		this.pop().instance.leave();	//	leave & remove current
	
		const previousModuleInfo = this.pop();	//	get previous

		if(previousModuleInfo) {
			const opts = {
				extraArgs	: previousModuleInfo.extraArgs, 
				savedState	: previousModuleInfo.savedState
			};

			return this.goto(previousModuleInfo.name, opts, cb);
		}
		
		return cb(new Error('No previous menu available!'));		
	}

	goto(name, options, cb) {
		const currentModuleInfo = this.top();

		if(!cb && _.isFunction(options)) {
			cb = options;
		}

		const self = this;

		if(currentModuleInfo && name === currentModuleInfo.name) {
			if(cb) {
				cb(new Error('Already at supplied menu!'));
			}
			return;
		}

		const loadOpts = {
			name		: name,
			client		: self.client, 
		};

		if(_.isObject(options)) {
			loadOpts.extraArgs = options.extraArgs;
		}

		loadMenu(loadOpts, (err, modInst) => {
			if(err) {
				//	:TODO: probably should just require a cb...
				const errCb = cb || self.client.defaultHandlerMissingMod();
				errCb(err);
			} else {
				self.client.log.debug( { menuName : name }, 'Goto menu module');

				if(currentModuleInfo) {
					//	save stack state
					currentModuleInfo.savedState = currentModuleInfo.instance.getSaveState();

					currentModuleInfo.instance.leave();
				}

				self.push({
					name		: name,
					instance	: modInst,
					extraArgs	: loadOpts.extraArgs,
				});

				//	restore previous state if requested
				if(options && options.savedState) {
					modInst.restoreSavedState(options.savedState);
				}

				modInst.enter();

				self.client.log.trace(
					{ stack : _.map(self.stack, stackEntry => stackEntry.name) },
					'Updated menu stack');

				if(cb) {
					cb(null);
				}
			}
		});
	}
};
