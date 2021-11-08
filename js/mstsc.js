


// mstsc.js
(function() {

	/**
	 * Use for domain declaration
	 */
	Mstsc = function () {
	}
	
	Mstsc.prototype = {
		// shortcut
		$ : function (id) {
			return document.getElementById(id);
		},
		
		/**
		 * Compute screen offset for a target element
		 * @param el {DOM element}
		 * @return {top : {integer}, left {integer}}
		 */
		elementOffset : function (el) {
		    var x = 0;
		    var y = 0;
		    while (el && !isNaN( el.offsetLeft ) && !isNaN( el.offsetTop )) {
		        x += el.offsetLeft - el.scrollLeft;
		        y += el.offsetTop - el.scrollTop;
		        el = el.offsetParent;
		    }
		    return { top: y, left: x };
		},
		
		/**
		 * Try to detect browser
		 * @returns {String} [firefox|chrome|ie]
		 */
		browser : function () {
			if (typeof InstallTrigger !== 'undefined') {
				return 'firefox';
			}
			
			if (!!window.chrome) {
				return 'chrome';
			}
			
			if (!!document.docuemntMode) {
				return 'ie';
			}
			
			return null;
		},
		
		/**
		 * Try to detect language
		 * @returns
		 */
		locale : function () {
			return window.navigator.userLanguage || window.navigator.language;
		}
	}
	
})();

this.Mstsc = new Mstsc();

// client.js
(function() {
	/**
	 * Mouse button mapping
	 * @param button {integer} client button number
	 */
	function mouseButtonMap(button) {
		switch(button) {
		case 0:
			return 1;
		case 2:
			return 2;
		default:
			return 0;
		}
	};
	
	/**
	 * Mstsc client
	 * @param canvas {canvas} rendering element
	 * @param Module rdp wasm module
	 */
	function Client(Module, canvas, stream) {
		this.canvas = canvas;
        this.socket = stream;
		// create renderer
		//this.render = new Mstsc.Canvas.create(this.canvas); 
		this.activeSession = true;
		this.config = Object.assign({
            width: 1024,
            height: 768,
            bpp: 16,
            disabledGraphicOrders: 0, // MultiSelectToInt(disabled_graphics_input, Module.GraphicOrders),
            username: 'Administrator',
            password: 'HSCN123!',
            // getRandomValues: (data) => crypto.getRandomValues(data),
            verbosity:  0/*0x04000000*/,
            keylayout: 0x00010409,
        });

		this.flag = 0;

		console.log('newRdpGraphics2D', newRdpGraphics2D)
				
		// optional
		const LogLevel = Module.LogLevel;
		Module.log = function(priority, msg) {
			const logger = (priority === LogLevel.Info) ? console.log
						: (priority === LogLevel.Warning) ? console.warn
						: (priority === LogLevel.Error) ? console.error
						: (priority === LogLevel.Debug) ? (s) => {
							console.debug("%c%s", 'color:yellow', s)
						}
						: console.info;
			logger(msg);
		};

		const self = this

		if(typeof(newRdpGraphics2D) === 'undefined') {
			console.log('no newRdpGraphics2D')
			return;
		}

		const gd = newRdpGraphics2D(canvas, Module);
		self.render = new Module.RdpClient(gd, self.config);
		self.MouseFlags = Module.MouseFlags;
		self.InputFlags = Module.InputFlags;

		self.GraphicOrders = Module.GraphicOrders;
		
		//self.clipboard = new ClipboardChannel()

		this.install();

	}
	
	Client.prototype = {
		install : function () {
			var self = this;

			this.sendMouseEvent = function(evt, flags)
			{
				evt.preventDefault();
				evt.stopImmediatePropagation();
				self.render.writeMouseEvent(evt.offsetX, evt.offsetY, flags);
				self.sendData();
			}

			// bind mouse move event
			this.canvas.addEventListener('mousemove', function (e) {
				if (!self.socket) return;
				
				//self.sendMouseEvent(e, self.flag);
				//self.sendMouseEvent(e, self.MouseFlags.Move)
				return false;
			});
			this.canvas.addEventListener('mousedown', function (e) {
				if (!self.socket) return;
				
				self.sendMouseButton(e, self.MouseFlags.Down)
				return false;
			});
			this.canvas.addEventListener('mouseup', function (e) {
				if (!self.socket) return;

				self.sendMouseButton(e, self.MouseFlags.Up)
				return false;
			});

			this.canvas.addEventListener('contextmenu', function (e) {
				e.preventDefault();
				return false;
			});

			this.canvas.addEventListener('DOMMouseScroll', function (e) {
				if (!self.socket || !self.activeSession) return;
				
				var isHorizontal = false;
				var delta = e.detail;
				var step = Math.round(Math.abs(delta) * 15 / 8);
				
				var offset = Mstsc.elementOffset(self.canvas);
				//self.socket.emit('wheel', e.clientX - offset.left, e.clientY - offset.top, step, delta > 0, isHorizontal);
				e.preventDefault();
				return false;
			});
			this.canvas.addEventListener('mousewheel', function (evt) {
				if (!self.socket || !self.activeSession) return;
				
				if (evt.deltaY) {
					const delta = (evt.deltaY < 0)
						? self.MouseFlags.WheelRotationMask
						: self.MouseFlags.WheelNegative;
					self.sendMouseEvent(evt, self.MouseFlags.VerticalWheel | delta);
				}
				else if (evt.deltaX && hWheelSupport) {
					const delta = (evt.deltaX < 0)
						? self.MouseFlags.WheelRotationMask
						: self.MouseFlags.WheelNegative;
					self.sendMouseEvent(evt, self.MouseFlags.HorizontalWheel | delta);
				}
				return false;
			});
			
			// bind keyboard event
			window.addEventListener('keydown', function (e) {
				if (!self.socket || !self.activeSession) return;
				
				self.sendScancodes([Mstsc.scancode(e)], e);
				return false;
			});
			window.addEventListener('keyup', function (e) {
				if (!self.socket || !self.activeSession) return;
				
				//self.sendScancodes([Mstsc.scancode(e)], e);
				
				return false;
			});

			this.sendData = function() {
				const out = self.render.getOutputData();
				if (out.length) {
					self.socket.send(out);
					self.render.resetOutputData();
				}
			};
			
			this.socket.onopen = function(e) {
				self.render.writeFirstPacket();
				self.sendData();
				/*
				self.t = setInterval(function() {
					console.log('render')
					self.sendData();
				}, 1000);*/
			}

			this.socket.onerror = function(e) {
				console.log('onerror')
			}
			this.socket.onclose = function(e)  {
				console.log('onclose')
				self.render.delete();

				clearInterval(self.t);
			}
			this.socket.onmessage = function(event)  {
				//console.log('onmessage', event.data)
				try {
					self.render.processInputData(event.data);
					self.sendData();
				}
				catch(e) {
					console.log('processInputData', e);
					self.socket = null;
					self.render = null;
					clearInterval(self.t);

					var ctx = self.canvas.getContext("2d");

					ctx.font = "30px Verdana";
					// Create gradient
					var gradient = ctx.createLinearGradient(0, 0, self.canvas.width, 0);
					gradient.addColorStop("0", "magenta");
					gradient.addColorStop("0.5", "blue");
					gradient.addColorStop("1.0", "red");

					// Fill with gradient
					ctx.strokeStyle = gradient;
					ctx.strokeText("connection losed!~", self.canvas.width/2 - 150, self.canvas.height/2);
				}
			}

			self.sendScancodes = function(scancodes, evt) {
				if (scancodes) {
					evt.preventDefault();
					evt.stopImmediatePropagation();
					for (let i = 0; i < scancodes.length; ++i) {
						const scancode = scancodes[i];
						console.log('Scancode: send', scancode, '0x'+scancode.toString(16));
						self.render.writeScancodeEvent(scancode);
					}
					self.sendData();
				}
				else {
					console.warn('Scancode: unknown keycode', evt.key, evt.code)
				}
			}

			this.sendMouseEvent = function (evt, flags)
			{
				evt.preventDefault();
				evt.stopImmediatePropagation();
				self.render.writeMouseEvent(evt.offsetX, evt.offsetY, flags);
				self.sendData();
			}
		
			this.sendMouseButton = function (evt, flag)
			{
				switch (evt.button) {
				case 0: return self.sendMouseEvent(evt, flag | self.MouseFlags.LeftButton);
				case 1: return self.sendMouseEvent(evt, flag | self.MouseFlags.MiddleButton);
				case 2: return self.sendMouseEvent(evt, flag | self.MouseFlags.RightButton);
				case 3: return self.sendMouseEvent(evt, flag | self.MouseFlags.Button4); break;
				case 4: return self.sendMouseEvent(evt, flag | self.MouseFlags.Button5); break;
				}
			}
			
			return this;
		}
	}
	
	Mstsc.client = {
		create : function (Module, gd, canvas, stream) {
			return new Client(Module, gd, canvas, stream);
		}
	}
})();


(function() {
	// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
	var KeyMap = {
	 	"" : 0x0000,
	 	"Escape" : 0x0001,
	 	"Digit1" : 0x0002,
	 	"Digit2" : 0x0003,
	 	"Digit3" : 0x0004,
	 	"Digit4" : 0x0005,
	 	"Digit5" : 0x0006,
		"Digit6" : 0x0007,
	 	"Digit7" : 0x0008,
	 	"Digit8" : 0x0009,
	 	"Digit9" : 0x000A,
	 	"Digit0" : 0x000B,
	 	"Minus" : 0x000C,
	 	"Equal" : 0x000D,
 	 	"Backspace" : 0x000E,
 	 	"Tab" : 0x000F,
 	 	"KeyQ" : 0x0010,
 	 	"KeyW" : 0x0011,
 	 	"KeyE" : 0x0012,
 	 	"KeyR" : 0x0013,
 	 	"KeyT" : 0x0014,
 	 	"KeyY" : 0x0015,
 	 	"KeyU" : 0x0016,
 	 	"KeyI" : 0x0017,
 	 	"KeyO" : 0x0018,
 	 	"KeyP" : 0x0019,
 	 	"BracketLeft" : 0x001A,
 	 	"BracketRight" : 0x001B,
 	 	"Enter" : 0x001C,
 	 	"ControlLeft" : 0x001D,
 	 	"KeyA" : 0x001E,
 	 	"KeyS" : 0x001F,
 	 	"KeyD" : 0x0020,
 	 	"KeyF" : 0x0021,
 	 	"KeyG" : 0x0022,
 	 	"KeyH" : 0x0023,
 	 	"KeyJ" : 0x0024,
 	 	"KeyK" : 0x0025,
 	 	"KeyL" : 0x0026,
 	 	"Semicolon" : 0x0027,
 	 	"Quote" : 0x0028,
 	 	"Backquote" : 0x0029,
 	 	"ShiftLeft" : 0x002A,
 	 	"Backslash" : 0x002B,
 	 	"KeyZ" : 0x002C,
 	 	"KeyX" : 0x002D,
 	 	"KeyC" : 0x002E,
 	 	"KeyV" : 0x002F,
 	 	"KeyB" : 0x0030,
 	 	"KeyN" : 0x0031,
 	 	"KeyM" : 0x0032,
 	 	"Comma" : 0x0033,
 	 	"Period" : 0x0034,
 	 	"Slash" : 0x0035,
 	 	"ShiftRight" : 0x0036,
 	 	"NumpadMultiply" : 0x0037,
 	 	"AltLeft" : 0x0038,
 	 	"Space" : 0x0039,
 	 	"CapsLock" : 0x003A,
 	 	"F1" : 0x003B,
 	 	"F2" : 0x003C,
 	 	"F3" : 0x003D,
 	 	"F4" : 0x003E,
 	 	"F5" : 0x003F,
 	 	"F6" : 0x0040,
 	 	"F7" : 0x0041,
 	 	"F8" : 0x0042,
 	 	"F9" : 0x0043,
 	 	"F10" : 0x0044,
 	 	"Pause" : 0x0045,
 	 	"ScrollLock" : 0x0046,
 	 	"Numpad7" : 0x0047,
 	 	"Numpad8" : 0x0048,
 	 	"Numpad9" : 0x0049,
 	 	"NumpadSubtract" : 0x004A,
 	 	"Numpad4" : 0x004B,
 	 	"Numpad5" : 0x004C,
 	 	"Numpad6" : 0x004D,
 	 	"NumpadAdd" : 0x004E,
 	 	"Numpad1" : 0x004F,
 	 	"Numpad2" : 0x0050,
 	 	"Numpad3" : 0x0051,
 	 	"Numpad0" : 0x0052,
 	 	"NumpadDecimal" : 0x0053,
 	 	"PrintScreen" : 0x0054,
 	 	"IntlBackslash" : 0x0056,
 	 	"F11" : 0x0057,
 	 	"F12" : 0x0058,
 	 	"NumpadEqual" : 0x0059,
 	 	"F13" : 0x0064,
 	 	"F14" : 0x0065,
 	 	"F15" : 0x0066,
 	 	"F16" : 0x0067,
 	 	"F17" : 0x0068,
 	 	"F18" : 0x0069,
 	 	"F19" : 0x006A,
 	 	"F20" : 0x006B,
 	 	"F21" : 0x006C,
 	 	"F22" : 0x006D,
 	 	"F23" : 0x006E,
 	 	"KanaMode" : 0x0070,
 	 	"Lang2" : 0x0071,
 	 	"Lang1" : 0x0072,
 	 	"IntlRo" : 0x0073,
 	 	"F24" : 0x0076,
 	 	"Convert" : 0x0079,
 	 	"NonConvert" : 0x007B,
 	 	"IntlYen" : 0x007D,
 	 	"NumpadComma" : 0x007E,
 	 	"MediaTrackPrevious" : 0xE010,
 	 	"MediaTrackNext" : 0xE019,
 	 	"NumpadEnter" : 0xE01C,
 	 	"ControlRight" : 0xE01D,
 	 	"VolumeMute" : 0xE020,
 	 	"LaunchApp2" : 0xE021,
 	 	"MediaPlayPause" : 0xE022,
 	 	"MediaStop" : 0xE024,
 	 	"VolumeDown" : 0xE02E,
 	 	"VolumeUp" : 0xE030,
 	 	"BrowserHome" : 0xE032,
 	 	"NumpadDivide" : 0xE035,
 	 	"PrintScreen" : 0xE037,
 	 	"AltRight" : 0xE038,
 	 	"NumLock" : 0xE045,
 	 	"Pause" : 0xE046,
 	 	"Home" : 0xE047,
 	 	"ArrowUp" : 0xE048,
 	 	"PageUp" : 0xE049,
 	 	"ArrowLeft" : 0xE04B,
 	 	"ArrowRight" : 0xE04D,
 	 	"End" : 0xE04F,
 	 	"ArrowDown" : 0xE050,
 	 	"PageDown" : 0xE051,
 	 	"Insert" : 0xE052,
 	 	"Delete" : 0xE053,
 	 	"OSLeft" : 0xE05B,
 	 	"OSRight" : 0xE05C,
 	 	"ContextMenu" : 0xE05D,
 	 	"Power" : 0xE05E,
 	 	"BrowserSearch" : 0xE065,
 	 	"BrowserFavorites" : 0xE066,
 	 	"BrowserRefresh" : 0xE067,
 	 	"BrowserStop" : 0xE068,
 	 	"BrowserForward" : 0xE069,
 	 	"BrowserBack" : 0xE06A,
 	 	"LaunchApp1" : 0xE06B,
 	 	"LaunchMail" : 0xE06C,
 	 	"MediaSelect" : 0xE06D
	};
	
	var UnicodeToCodeFirefox_FR = {
		27 : "Escape",
		112 : "F1",
		113 : "F2",
		114 : "F3",
		115 : "F4",
		116 : "F5",
		117 : "F6",
		118 : "F7",
		119 : "F8",
		120 : "F9",
		121 : "F10",
		122 : "F11",
		123 : "F12",
		0 : "Backquote",
		49 : "Digit1",
		50 : "Digit2",
		51 : "Digit3",
		52 : "Digit4",
		53 : "Digit5",
		54 : "Digit6",
		55 : "Digit7",
		56 : "Digit8",
		57 : "Digit9",
		48 : "Digit0",
		169 : "Minus",
		61 : "Equal",
		8 : "Backspace",
		9 : "Tab",
		65 : "KeyQ",
		90 : "KeyW",
		69 : "KeyE",
		82 : "KeyR",
		84 : "KeyT",
		89 : "KeyY",
		85 : "KeyU",
		73 : "KeyI",
		79 : "KeyO",
		80 : "KeyP",
		160 : "BracketLeft",
		164 : "BracketRight",
		13 : "Enter",
		20 : "CapsLock",
		20 : "CapsLock",
		81 : "KeyA",
		83 : "KeyS",
		68 : "KeyD",
		70 : "KeyF",
		71 : "KeyG",
		72 : "KeyH",
		74 : "KeyJ",
		75 : "KeyK",
		76 : "KeyL",
		77 : "Semicolon",
		165 : "Quote",
		170 : "Backslash",
		16 : "ShiftLeft",
		60 : "IntlBackslash",
		87 : "KeyZ",
		88 : "KeyX",
		67 : "KeyC",
		86 : "KeyV",
		66 : "KeyB",
		78 : "KeyN",
		188 : "KeyM",
		59 : "Comma",
		58 : "Period",
		161 : "Slash",
		16 : "ShiftRight",
		17 : "ControlLeft",
		91 : "OSLeft",
		18 : "AltLeft",
		32 : "Space",
		17 : "ControlLeft",
		18 : "AltRight",
		91 : "OSRight",
		93 : "ContextMenu",
		17 : "ControlRight",
		37 : "ArrowLeft",
		38 : "ArrowUp",
		40 : "ArrowDown",
		39 : "ArrowRight",
		144 : "NumLock",
		144 : "NumLock",
		111 : "NumpadDivide",
		106 : "NumpadMultiply",
		109 : "NumpadSubtract",
		103 : "Numpad7",
		104 : "Numpad8",
		105 : "Numpad9",
		107 : "NumpadAdd",
		100 : "Numpad4",
		101 : "Numpad5",
		102 : "Numpad6",
		97 : "Numpad1",
		98 : "Numpad2",
		99 : "Numpad3",
		96 : "Numpad0",
		110 : "NumpadDecimal",
		13 : "NumpadEnter",
		17 : "ControlLeft",
		67 : "KeyC",
		17 : "ControlLeft"
	};
	
	var UnicodeToCodeChrome_FR = {
		27 : "Escape",
		112 : "F1",
		113 : "F2",
		114 : "F3",
		115 : "F4",
		116 : "F5",
		117 : "F6",
		118 : "F7",
		119 : "F8",
		120 : "F9",
		121 : "F10",
		122 : "F11",
		123 : "F12",
		0 : "Backquote",
		49 : "Digit1",
		50 : "Digit2",
		51 : "Digit3",
		52 : "Digit4",
		53 : "Digit5",
		54 : "Digit6",
		55 : "Digit7",
		56 : "Digit8",
		57 : "Digit9",
		48 : "Digit0",
		219 : "Minus",
		187 : "Equal",
		8 : "Backspace",
		9 : "Tab",
		65 : "KeyQ",
		90 : "KeyW",
		69 : "KeyE",
		82 : "KeyR",
		84 : "KeyT",
		89 : "KeyY",
		85 : "KeyU",
		73 : "KeyI",
		79 : "KeyO",
		80 : "KeyP",
		221 : "BracketLeft",
		186 : "BracketRight",
		13 : "Enter",
		20 : "CapsLock",
		20 : "CapsLock",
		81 : "KeyA",
		83 : "KeyS",
		68 : "KeyD",
		70 : "KeyF",
		71 : "KeyG",
		72 : "KeyH",
		74 : "KeyJ",
		75 : "KeyK",
		76 : "KeyL",
		77 : "Semicolon",
		192 : "Quote",
		220 : "Backslash",
		16 : "ShiftLeft",
		60 : "IntlBackslash",
		87 : "KeyZ",
		88 : "KeyX",
		67 : "KeyC",
		86 : "KeyV",
		66 : "KeyB",
		78 : "KeyN",
		188 : "KeyM",
		190 : "Comma",
		191 : "Period",
		223 : "Slash",
		16 : "ShiftRight",
		17 : "ControlLeft",
		91 : "OSLeft",
		18 : "AltLeft",
		32 : "Space",
		17 : "ControlLeft",
		18 : "AltRight",
		91 : "OSRight",
		93 : "ContextMenu",
		17 : "ControlRight",
		37 : "ArrowLeft",
		38 : "ArrowUp",
		40 : "ArrowDown",
		39 : "ArrowRight",
		144 : "NumLock",
		144 : "NumLock",
		111 : "NumpadDivide",
		106 : "NumpadMultiply",
		109 : "NumpadSubtract",
		103 : "Numpad7",
		104 : "Numpad8",
		105 : "Numpad9",
		107 : "NumpadAdd",
		100 : "Numpad4",
		101 : "Numpad5",
		102 : "Numpad6",
		97 : "Numpad1",
		98 : "Numpad2",
		99 : "Numpad3",
		96 : "Numpad0",
		110 : "NumpadDecimal",
		13 : "NumpadEnter",
		17 : "ControlLeft",
		67 : "KeyC",
		17 : "ControlLeft"
	};
	
	var UnicodeToCode_EN = {
		27 : "Escape",
		112 : "F1",
		113 : "F2",
		114 : "F3",
		115 : "F4",
		116 : "F5",
		117 : "F6",
		118 : "F7",
		119 : "F8",
		120 : "F9",
		121 : "F10",
		122 : "F11",
		123 : "F12",
		192 : "Backquote",
		49 : "Digit1",
		50 : "Digit2",
		51 : "Digit3",
		52 : "Digit4",
		53 : "Digit5",
		54 : "Digit6",
		55 : "Digit7",
		56 : "Digit8",
		57 : "Digit9",
		48 : "Digit0",
		173 : "Minus",
		61 : "Equal",
		8 : "Backspace",
		9 : "Tab",
		81 : "KeyQ",
		87 : "KeyW",
		69 : "KeyE",
		82 : "KeyR",
		84 : "KeyT",
		89 : "KeyY",
		85 : "KeyU",
		73 : "KeyI",
		79 : "KeyO",
		80 : "KeyP",
		219 : "BracketLeft",
		221 : "BracketRight",
		13 : "Enter",
		20 : "CapsLock",
		65 : "KeyA",
		83 : "KeyS",
		68 : "KeyD",
		70 : "KeyF",
		71 : "KeyG",
		72 : "KeyH",
		74 : "KeyJ",
		75 : "KeyK",
		76 : "KeyL",
		59 : "Semicolon",
		222 : "Quote",
		220 : "Backslash",
		16 : "ShiftLeft",
		220 : "IntlBackslash",
		90 : "KeyZ",
		88 : "KeyX",
		67 : "KeyC",
		86 : "KeyV",
		66 : "KeyB",
		78 : "KeyN",
		77 : "KeyM",
		188 : "Comma",
		190 : "Period",
		191 : "Slash",
		16 : "ShiftRight",
		17 : "ControlLeft",
		18 : "AltLeft",
		91 : "OSLeft",
		32 : "Space",
		18 : "AltRight",
		91 : "OSRight",
		93 : "ContextMenu",
		17 : "ControlRight",
		37 : "ArrowLeft",
		38 : "ArrowUp",
		40 : "ArrowDown",
		39 : "ArrowRight",
		144 : "NumLock",
		144 : "NumLock",
		111 : "NumpadDivide",
		106 : "NumpadMultiply",
		109 : "NumpadSubtract",
		103 : "Numpad7",
		104 : "Numpad8",
		105 : "Numpad9",
		107 : "NumpadAdd",
		100 : "Numpad4",
		101 : "Numpad5",
		102 : "Numpad6",
		97 : "Numpad1",
		98 : "Numpad2",
		99 : "Numpad3",
		13 : "NumpadEnter",
		96 : "Numpad0",
		110 : "NumpadDecimal",
		17 : "ControlLeft"	
	};
	
	
	var UnicodeToCode = {
		'firefox' : {
			'fr' : UnicodeToCodeFirefox_FR,
			'en' : UnicodeToCode_EN
		},
		
		'chrome' : {
			'fr' : UnicodeToCodeChrome_FR,
			'en' : UnicodeToCode_EN
		}
	}
	
	/**
	 * Scancode of keyevent
	 * @param e {keyboardevent}
	 * @return {integer} scancode
	 */
	function scancode (e) {
		var locale = Mstsc.locale();
		//locale = (['fr', 'en'].indexOf(locale) > 0 && locale) || 'en';
	 	locale = 'en';
		//console.log(KeyMap[e.code || UnicodeToCode[Mstsc.browser() || 'firefox'][locale][e.keyCode]])
		return KeyMap[e.code || UnicodeToCode[Mstsc.browser() || 'firefox'][locale][e.keyCode]];
	}
	
	Mstsc.scancode = scancode;
	
})();
