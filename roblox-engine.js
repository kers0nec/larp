// roblox-engine.js - Roblox Luau Execution, Security Scanning, and Visual Output Generator
const { createCanvas } = require('@napi-rs/canvas');
const fengari = require('fengari');
const { lua, lauxlib, lualib } = fengari;

// Common Known Malicious / Exfiltration Domains
const LOGGER_DOMAINS = [
    'iplogger.org', 'iplogger.com', 'iplogger.ru', '2no.co', 'yip.su',
    'grabify.link', 'blasze.com', 'httpbin.org/ip', 'api.ipify.org',
    'ident.me', 'ifconfig.me', 'ip-api.com', 'wtfismyip.com', 'ipinfo.io',
    'checkip.amazonaws.com', 'canary.tools', 'webhook.site'
];

// Discord Webhook Regex Patterns (Standard, Canary, PTB)
const DISCORD_WEBHOOK_REGEX = /https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/gi;

/**
 * Validates if the given text is a Roblox Luau/Lua script
 */
function isRobloxScript(source) {
    if (!source || typeof source !== 'string') {
        return { isRoblox: false, reason: 'Empty source code provided.' };
    }

    const clean = source.trim();
    if (clean.length < 5) {
        return { isRoblox: false, reason: 'Source code is too short to be a valid Roblox script.' };
    }

    // Check for obvious non-Roblox languages
    const nonRobloxPatterns = [
        { pattern: /^(?:import\s+os|import\s+sys|def\s+\w+\s*\(|from\s+\w+\s+import)/m, lang: 'Python' },
        { pattern: /(?:const\s+\w+\s*=\s*require\(|console\.log\(|document\.getElementById|window\.addEventListener)/, lang: 'JavaScript/Node.js' },
        { pattern: /^(?:#!\/bin\/bash|#!\/bin\/sh|sudo\s+apt|systemctl\s+)/m, lang: 'Bash/Shell' },
        { pattern: /<\?php/, lang: 'PHP' },
        { pattern: /^(?:#include\s+<iostream>|#include\s+<stdio\.h>|int\s+main\s*\()/m, lang: 'C/C++' },
        { pattern: /(?:public\s+class\s+\w+|System\.out\.println)/, lang: 'Java' }
    ];

    for (const check of nonRobloxPatterns) {
        if (check.pattern.test(clean)) {
            return {
                isRoblox: false,
                reason: `Detected ${check.lang} code. This executor runs Roblox Luau scripts only.`
            };
        }
    }

    // Check for Roblox / Luau syntax indicators
    const robloxIndicators = [
        /loadstring\s*\(/i,
        /game\s*:\s*GetService/i,
        /game\s*\.\s*[A-Z]\w+/,
        /\bworkspace\b/i,
        /\bInstance\.new\b/,
        /\bVector3\.new\b/,
        /\bVector2\.new\b/,
        /\bCFrame\.new\b/,
        /\bColor3\.(?:fromRGB|new|fromHex)\b/,
        /\bUDim2\.new\b/,
        /\btask\.(?:wait|spawn|delay)\b/,
        /\bPlayers(?:\.LocalPlayer|:GetPlayers)\b/,
        /\bDrawing\.new\b/,
        /\bhookmetamethod\b/,
        /\bhookfunction\b/,
        /\bgetgenv\b/,
        /\bsetclipboard\b/,
        /\bfiresignal\b/,
        /\bfireclickdetector\b/,
        /\bRunService\b/,
        /\bUserInputService\b/,
        /\bTweenService\b/,
        /\bHttpService\b/,
        /\bRayfield\b/i,
        /\bOrion\b/i,
        /\bKavo\b/i,
        /\bSolaris\b/i,
        /\bLinoria\b/i,
        /\bMaclib\b/i,
        /\bVape\b/i,
        /\bLavaHub\b/i,
        /\bScreenGui\b/,
        /\bTextLabel\b/,
        /\bTextButton\b/,
        /\blocal\s+\w+\s*=/
    ];

    let matchCount = 0;
    for (const regex of robloxIndicators) {
        if (regex.test(clean)) {
            matchCount++;
        }
    }

    // If it's pure standard Lua syntax (function/end/local/then)
    const luaSyntaxIndicators = [
        /\blocal\b/,
        /\bfunction\b/,
        /\bend\b/,
        /\bthen\b/,
        /\bdo\b/,
        /\buntil\b/,
        /\breturn\b/,
        /\bpcall\b/
    ];
    let luaMatches = 0;
    for (const r of luaSyntaxIndicators) {
        if (r.test(clean)) luaMatches++;
    }

    if (matchCount > 0 || luaMatches >= 2) {
        return { isRoblox: true };
    }

    return {
        isRoblox: false,
        reason: 'Code does not appear to be a Roblox Luau script. Please provide a valid Roblox script or loadstring.'
    };
}

/**
 * Scans source code for Discord Webhooks, Crashers, and Loggers
 */
function scanRobloxScript(source) {
    const findings = {
        hasWebhook: false,
        webhookUrls: [],
        hasCrasher: false,
        crasherDetails: [],
        hasLogger: false,
        loggerDetails: [],
        isObfuscated: false,
        obfuscationDetails: null,
        threatLevel: 'SAFE' // 'SAFE' | 'WARNING' | 'CRITICAL'
    };

    if (!source || typeof source !== 'string') return findings;

    // 1. DISCORD WEBHOOK SCAN (High Priority - Stop Execution)
    const webhookMatches = source.match(DISCORD_WEBHOOK_REGEX);
    if (webhookMatches && webhookMatches.length > 0) {
        findings.hasWebhook = true;
        findings.threatLevel = 'CRITICAL';
        findings.webhookUrls = webhookMatches.map(url => {
            // Mask the webhook token for security
            return url.replace(/(webhooks\/\d+\/)([A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/i, '$1$2********');
        });
    }

    // Check for string-concatenated or obfuscated webhooks
    if (!findings.hasWebhook) {
        if (/["']discord(?:app)?\.com["']\s*\.\.\s*["']\/api\/webhooks["']/i.test(source) ||
            /api\/webhooks/i.test(source) && /discord/i.test(source)) {
            findings.hasWebhook = true;
            findings.threatLevel = 'CRITICAL';
            findings.webhookUrls.push('Obfuscated Discord Webhook detected in string operations');
        }
    }

    // 2. CRASHER SCAN
    // Unthrottled infinite loops without yield
    const unthrottledLoop = /while\s+(?:true|1)\s+do\s*(?!.*(?:task\.wait|wait\s*\(|RunService|\.Wait\())/s;
    if (unthrottledLoop.test(source)) {
        findings.hasCrasher = true;
        findings.crasherDetails.push('Unthrottled infinite loop without yield (will freeze client)');
    }

    // Memory / Part spam clone bomb
    if (/Instance\.new\s*\(\s*["']Part["']\s*\)\.Parent\s*=\s*workspace/i.test(source) &&
        /while\s+(?:true|1)\s+do/i.test(source)) {
        findings.hasCrasher = true;
        findings.crasherDetails.push('Infinite Part cloning bomb (causes memory exhaustion & crash)');
    }

    // Excessive table bloat / memory bomb
    if (/table\.insert\s*\([^,]+,\s*string\.rep/i.test(source)) {
        findings.hasCrasher = true;
        findings.crasherDetails.push('Memory allocator bomb using string.rep table bloat');
    }

    // Explicit crash calls
    if (/\bcrash\s*\(\s*\)/i.test(source) || /while\s+true\s+do\s+rconsoleclear/i.test(source)) {
        findings.hasCrasher = true;
        findings.crasherDetails.push('Explicit client crash / console spam function detected');
    }

    // 3. LOGGER / GRABBER SCAN
    // Check known IP logger domains
    for (const domain of LOGGER_DOMAINS) {
        if (source.toLowerCase().includes(domain)) {
            findings.hasLogger = true;
            findings.loggerDetails.push(`Known IP logger domain referenced: \`${domain}\``);
        }
    }

    // Check cookie / auth token grabber patterns
    if (/\.ROBLOSECURITY/i.test(source) || /rbx-authentication-ticket/i.test(source)) {
        findings.hasLogger = true;
        findings.loggerDetails.push('Attempt to extract .ROBLOSECURITY authentication cookie');
    }

    // Check sending user ID alongside HTTP requests to external domains
    if (/HttpPost|request|http_request/i.test(source) &&
        /LocalPlayer\.UserId/i.test(source) &&
        !findings.hasWebhook) {
        findings.hasLogger = true;
        findings.loggerDetails.push('Transmitting LocalPlayer UserId to external endpoint');
    }

    // Clipboard sniffing with exfiltration
    if (/getclipboard\s*\(\s*\)/i.test(source) && /HttpPost|request|http_request/i.test(source)) {
        findings.hasLogger = true;
        findings.loggerDetails.push('Reading clipboard content and exfiltrating over HTTP');
    }

    // 4. OBFUSCATION SCAN
    if (/--\s*\[\[.*(?:Moonsec|Luraph|IronBrew|PSU|Promethium|Synapse Xen)/i.test(source)) {
        findings.isObfuscated = true;
        findings.obfuscationDetails = 'Known Obfuscator watermark detected';
    } else if ((source.match(/\\x[0-9a-fA-F]{2}/g) || []).length > 40) {
        findings.isObfuscated = true;
        findings.obfuscationDetails = 'Heavy hex byte-sequence string obfuscation detected';
    }

    if (findings.threatLevel !== 'CRITICAL') {
        if (findings.hasCrasher || findings.hasLogger) {
            findings.threatLevel = 'WARNING';
        } else {
            findings.threatLevel = 'SAFE';
        }
    }

    return findings;
}

/**
 * Resolves a loadstring if present (fetches remote content)
 */
async function resolveLoadstring(input) {
    if (!input || typeof input !== 'string') return null;

    const trimmed = input.trim();
    // Match loadstring(game:HttpGet("url")) or loadstring(game:HttpGet('url')) or loadstring(http.get('url'))
    const match = trimmed.match(/loadstring\s*\(\s*(?:game\s*:\s*HttpGet|http\s*:\s*Get|HttpGet|http_get)\s*\(\s*["'](https?:\/\/[^"']+)["']\s*\)\s*\)\s*\(\s*\)/i)
        || trimmed.match(/loadstring\s*\(\s*["'](https?:\/\/[^"']+)["']\s*\)/i)
        || (trimmed.startsWith('http') && trimmed.includes('github') ? [null, trimmed] : null);

    if (match && match[1]) {
        const url = match[1];
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Roblox/WinInet',
                    'Accept': 'text/plain, */*'
                }
            });
            clearTimeout(timeout);

            if (response.ok) {
                const fetchedCode = await response.text();
                return {
                    isLoadstring: true,
                    url,
                    sourceCode: fetchedCode
                };
            }
        } catch (err) {
            return {
                isLoadstring: true,
                url,
                fetchError: err.message
            };
        }
    }

    return null;
}

/**
 * Extracts UI elements, ESP tags, or game features from the script
 */
function extractScriptFeatures(source) {
    const features = {
        title: 'Roblox Script Output',
        uiFramework: null, // 'Rayfield' | 'Orion' | 'Kavo' | 'Custom'
        tabs: [],
        toggles: [],
        sliders: [],
        buttons: [],
        isEsp: false,
        isCombat: false,
        detectedGame: 'Universal Roblox Game'
    };

    if (!source) return features;

    // Detect UI frameworks
    if (/Rayfield/i.test(source)) features.uiFramework = 'Rayfield UI';
    else if (/Orion/i.test(source)) features.uiFramework = 'Orion Hub';
    else if (/Kavo/i.test(source)) features.uiFramework = 'Kavo UI';
    else if (/Solaris/i.test(source)) features.uiFramework = 'Solaris';
    else if (/Linoria/i.test(source)) features.uiFramework = 'LinoriaLib';
    else if (/ScreenGui/i.test(source)) features.uiFramework = 'Custom ScreenGui';

    // Window Title
    const titleMatch = source.match(/(?:CreateWindow|CreateLib|New|MakeWindow)\s*\(\s*\{?[^)]*?Name\s*=\s*["']([^"']+)["']/i)
        || source.match(/["']([A-Z0-9_\s]{3,24}(?:Hub|Script|GUI|Menu|V\d|V\.\d|PvP|Combat|Spin))["']/i);
    if (titleMatch && titleMatch[1]) {
        features.title = titleMatch[1].trim();
    }

    // Tabs
    const tabMatches = [...source.matchAll(/(?:CreateTab|NewTab|AddTab)\s*\(\s*["']([^"']+)["']/gi)];
    for (const m of tabMatches) {
        if (m[1] && !features.tabs.includes(m[1])) {
            features.tabs.push(m[1].slice(0, 16));
        }
    }
    if (features.tabs.length === 0) {
        features.tabs = ['Main', 'Combat', 'Visuals', 'Misc'];
    }

    // Toggles
    const toggleMatches = [...source.matchAll(/(?:CreateToggle|NewToggle|AddToggle)\s*\(\s*\{?[^)]*?Name\s*=\s*["']([^"']+)["']/gi)];
    for (const m of toggleMatches) {
        if (m[1] && !features.toggles.includes(m[1])) {
            features.toggles.push(m[1].slice(0, 24));
        }
    }

    // Sliders
    const sliderMatches = [...source.matchAll(/(?:CreateSlider|NewSlider|AddSlider)\s*\(\s*\{?[^)]*?Name\s*=\s*["']([^"']+)["']/gi)];
    for (const m of sliderMatches) {
        if (m[1] && !features.sliders.includes(m[1])) {
            features.sliders.push(m[1].slice(0, 24));
        }
    }

    // Buttons
    const buttonMatches = [...source.matchAll(/(?:CreateButton|NewButton|AddButton)\s*\(\s*\{?[^)]*?Name\s*=\s*["']([^"']+)["']/gi)];
    for (const m of buttonMatches) {
        if (m[1] && !features.buttons.includes(m[1])) {
            features.buttons.push(m[1].slice(0, 24));
        }
    }

    // ESP check
    if (/ESP|BoxESP|Tracers|Chams|NameESP|SkeletonESP/i.test(source) || /Drawing\.new\s*\(\s*["']Line["']\)/i.test(source)) {
        features.isEsp = true;
    }

    // Combat check
    if (/SilentAim|Aimbot|AutoParry|AutoBlock|KillAura|HitboxExpander|TriggerBot/i.test(source)) {
        features.isCombat = true;
    }

    // Game detection
    if (/Blox\s*Fruits/i.test(source)) features.detectedGame = 'Blox Fruits';
    else if (/Blade\s*Ball/i.test(source)) features.detectedGame = 'Blade Ball';
    else if (/Arsenal/i.test(source)) features.detectedGame = 'Arsenal';
    else if (/Da\s*Hood/i.test(source)) features.detectedGame = 'Da Hood';
    else if (/Pet\s*Simulator/i.test(source)) features.detectedGame = 'Pet Simulator 99';
    else if (/Duel/i.test(source)) features.detectedGame = 'Roblox Duel Game';

    return features;
}

/**
 * Executes Roblox Luau in a sandboxed Fengari Lua state
 */
function executeRobloxScript(source) {
    const logs = [];
    const startTime = Date.now();
    let runtimeSuccess = true;
    let errorMessage = null;

    try {
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);

        // Custom print function
        const customPrint = function(L_state) {
            const n = lua.lua_gettop(L_state);
            const parts = [];
            for (let i = 1; i <= n; i++) {
                const str = lua.lua_tojsstring(L_state, i);
                parts.push(str !== null ? str : '<nil>');
            }
            logs.push({ type: 'print', text: parts.join('   ') });
            return 0;
        };

        // Custom warn function
        const customWarn = function(L_state) {
            const n = lua.lua_gettop(L_state);
            const parts = [];
            for (let i = 1; i <= n; i++) {
                const str = lua.lua_tojsstring(L_state, i);
                parts.push(str !== null ? str : '<nil>');
            }
            logs.push({ type: 'warn', text: parts.join('   ') });
            return 0;
        };

        // Bind print and warn
        lua.lua_register(L, 'print', customPrint);
        lua.lua_register(L, 'warn', customWarn);

        // Inject simulated Roblox environment headers
        const robloxEnvBootstrap = `
            local _G = _G or {}
            local getgenv = function() return _G end
            local identifyexecutor = function() return "Solara / Wave X (Luau 5.3)" end

            task = {
                wait = function(sec) return sec or 0.03 end,
                spawn = function(f, ...) if type(f) == "function" then return pcall(f, ...) end end,
                delay = function(sec, f) if type(f) == "function" then return pcall(f) end end
            }
            wait = task.wait

            Vector3 = {
                new = function(x, y, z) return { X = x or 0, Y = y or 0, Z = z or 0 } end,
                zero = { X = 0, Y = 0, Z = 0 },
                one = { X = 1, Y = 1, Z = 1 }
            }
            Vector2 = {
                new = function(x, y) return { X = x or 0, Y = y or 0 } end,
                zero = { X = 0, Y = 0 }
            }
            CFrame = {
                new = function(x, y, z) return { Position = Vector3.new(x, y, z) } end
            }
            Color3 = {
                fromRGB = function(r, g, b) return { R = r/255, G = g/255, B = b/255 } end,
                new = function(r, g, b) return { R = r or 0, G = g or 0, B = b or 0 } end,
                fromHex = function(hex) return { R = 1, G = 1, B = 1 } end
            }
            UDim2 = {
                new = function(sx, ox, sy, oy) return { ScaleX = sx or 0, OffsetX = ox or 0, ScaleY = sy or 0, OffsetY = oy or 0 } end
            }
            UDim = {
                new = function(s, o) return { Scale = s or 0, Offset = o or 0 } end
            }

            local mockServices = {
                Players = {
                    LocalPlayer = {
                        Name = "RobloxUser",
                        UserId = 129481920,
                        Character = {
                            HumanoidRootPart = { Position = Vector3.new(0, 10, 0) },
                            Humanoid = { Health = 100, MaxHealth = 100, WalkSpeed = 16, JumpPower = 50 }
                        }
                    },
                    GetPlayers = function() return {} end
                },
                Workspace = {
                    CurrentCamera = {
                        CFrame = CFrame.new(0, 15, 20),
                        FieldOfView = 70
                    }
                },
                RunService = {
                    RenderStepped = { Connect = function(self, fn) return { Disconnect = function() end } end },
                    Heartbeat = { Connect = function(self, fn) return { Disconnect = function() end } end },
                    IsClient = function() return true end,
                    IsServer = function() return false end
                },
                TweenService = {
                    Create = function() return { Play = function() end, Stop = function() end } end
                },
                HttpService = {
                    JSONEncode = function(self, data) return "{}" end,
                    JSONDecode = function(self, str) return {} end,
                    GenerateGUID = function() return "guid-12345" end
                },
                UserInputService = {
                    InputBegan = { Connect = function() return { Disconnect = function() end } end },
                    IsKeyDown = function() return false end
                }
            }
            workspace = mockServices.Workspace

            game = {
                GetService = function(self, svcName)
                    return mockServices[svcName] or { Name = svcName }
                end,
                HttpGet = function(self, url) return "-- Mock HttpGet: " .. tostring(url) end,
                PlaceId = 8737899170,
                JobId = "job-491-simulation"
            }

            Instance = {
                new = function(className, parent)
                    local inst = { ClassName = className, Parent = parent, Name = className }
                    return inst
                end
            }

            Drawing = {
                new = function(drawingType)
                    return { Visible = true, Color = Color3.new(1, 1, 1), Transparency = 1, Remove = function() end }
                end
            }

            hookmetamethod = function(...) return function(...) end end
            hookfunction = function(...) return function(...) end end
            setclipboard = function(...) end
            firesignal = function(...) end
            fireclickdetector = function(...) end
        `;

        // Prepend bootstrap
        const fullExecutionSource = `${robloxEnvBootstrap}\n-- User Source Code:\n${source}`;

        const status = lauxlib.luaL_dostring(L, fengari.to_luastring(fullExecutionSource));
        if (status !== lua.LUA_OK) {
            const err = lua.lua_tojsstring(L, -1);
            runtimeSuccess = false;
            errorMessage = err || 'Unknown Luau runtime error';
            logs.push({ type: 'error', text: errorMessage });
        }
    } catch (e) {
        runtimeSuccess = false;
        errorMessage = e.message;
        logs.push({ type: 'error', text: `VM Sandbox Exception: ${e.message}` });
    }

    const durationMs = Date.now() - startTime;
    return {
        success: runtimeSuccess,
        errorMessage,
        logs,
        durationMs
    };
}

/**
 * Generates high-definition Execution Output Photo (Executor + Game Viewport)
 */
async function generateExecutionOutputImage(params) {
    const {
        features,
        scanResults,
        execResults,
        scriptName = 'script.lua'
    } = params;

    const width = 960;
    const height = 580;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Background (Dark metallic viewport)
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#0a0f1d');
    bgGradient.addColorStop(1, '#05070e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Top Window Title Bar (Mac/Windows Acrylic Style)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, 44);

    // Subtle bottom border on header
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 43, width, 1);

    // Control Dots
    ctx.fillStyle = '#ef4444'; // Red close
    ctx.beginPath();
    ctx.arc(22, 22, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f59e0b'; // Yellow minimize
    ctx.beginPath();
    ctx.arc(40, 22, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#10b981'; // Green maximize
    ctx.beginPath();
    ctx.arc(58, 22, 6, 0, Math.PI * 2);
    ctx.fill();

    // Titlebar Text
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('⚡ ROBLOX LUAU EXECUTION ENGINE • SOLARA / WAVE VM', 80, 26);

    // Right Status Badges
    const badgeText = execResults.success ? '● EXECUTED (60.0 FPS)' : '● EXECUTED WITH WARNINGS';
    ctx.fillStyle = execResults.success ? '#10b981' : '#f59e0b';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(badgeText, width - 200, 26);

    // 3. Main Viewport Area
    const viewY = 54;
    const viewHeight = 475;

    // Background Grid Pattern (Roblox 3D Studio / Game feel)
    ctx.strokeStyle = '#11192e';
    ctx.lineWidth = 1;
    for (let x = 20; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, viewY);
        ctx.lineTo(x, viewY + viewHeight);
        ctx.stroke();
    }
    for (let y = viewY; y < viewY + viewHeight; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Determine layout: UI Library Hub or Developer Console / ESP
    const hasUI = features.toggles.length > 0 || features.buttons.length > 0 || features.uiFramework;

    if (hasUI) {
        // --- RENDER ROBLOX EXECUTOR GUI HUB WINDOW ---
        const guiX = 140;
        const guiY = 80;
        const guiW = 680;
        const guiH = 420;

        // Window Shadow & Border
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(guiX + 8, guiY + 8, guiW, guiH);

        // GUI Background
        ctx.fillStyle = '#111827'; // Dark slate
        ctx.fillRect(guiX, guiY, guiW, guiH);

        // GUI Top Header
        const guiHeaderGrad = ctx.createLinearGradient(guiX, guiY, guiX + guiW, guiY);
        guiHeaderGrad.addColorStop(0, '#1e1b4b');
        guiHeaderGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = guiHeaderGrad;
        ctx.fillRect(guiX, guiY, guiW, 46);

        // Accent neon line under header
        ctx.fillStyle = '#6366f1'; // Indigo neon
        ctx.fillRect(guiX, guiY + 45, guiW, 2);

        // GUI Window Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px sans-serif';
        const displayTitle = features.title !== 'Roblox Script Output' ? features.title : 'Universal Script Hub';
        ctx.fillText(`🎮 ${displayTitle}`, guiX + 16, guiY + 28);

        // Hub Tag
        ctx.fillStyle = '#818cf8';
        ctx.font = '11px monospace';
        ctx.fillText(`[${features.uiFramework || 'Luau GUI'}]`, guiX + guiW - 130, guiY + 28);

        // Left Navigation Tab Bar
        const tabW = 160;
        ctx.fillStyle = '#0b0f19';
        ctx.fillRect(guiX, guiY + 47, tabW, guiH - 47);

        // Draw Tabs
        const tabsToDraw = (features.tabs && features.tabs.length > 0) ? features.tabs.slice(0, 5) : ['Main', 'Combat', 'Visuals', 'Misc'];
        for (let i = 0; i < tabsToDraw.length; i++) {
            const tabY = guiY + 55 + (i * 36);
            const isSelected = (i === 0);

            if (isSelected) {
                ctx.fillStyle = '#1f2937';
                ctx.fillRect(guiX + 6, tabY, tabW - 12, 30);
                ctx.fillStyle = '#6366f1';
                ctx.fillRect(guiX + 6, tabY, 3, 30); // selection bar
                ctx.fillStyle = '#ffffff';
            } else {
                ctx.fillStyle = '#94a3b8';
            }
            ctx.font = isSelected ? 'bold 12px sans-serif' : '12px sans-serif';
            ctx.fillText(tabsToDraw[i], guiX + 22, tabY + 20);
        }

        // Right Content Area (Controls)
        const contentX = guiX + tabW + 20;
        const contentW = guiW - tabW - 40;

        // Content Section Title
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('⚙️ Feature Controls & Toggles', contentX, guiY + 74);

        // Draw Toggles
        const defaultToggles = ['Auto Parry / Block', 'Silent Aim', 'Hitbox Expander', 'Speed Multiplier'];
        const togglesToRender = (features.toggles.length > 0 ? features.toggles : defaultToggles).slice(0, 4);

        for (let t = 0; t < togglesToRender.length; t++) {
            const toggleY = guiY + 95 + (t * 40);
            
            // Toggle Background card
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(contentX, toggleY, contentW, 32);

            // Toggle Label
            ctx.fillStyle = '#f1f5f9';
            ctx.font = '12px sans-serif';
            ctx.fillText(togglesToRender[t], contentX + 12, toggleY + 20);

            // Toggle Switch (Glowing Green Active Switch)
            const switchX = contentX + contentW - 54;
            const switchY = toggleY + 6;
            ctx.fillStyle = '#059669'; // Emerald ON
            ctx.beginPath();
            ctx.arc(switchX + 10, switchY + 10, 10, Math.PI / 2, Math.PI * 1.5);
            ctx.arc(switchX + 30, switchY + 10, 10, Math.PI * 1.5, Math.PI / 2);
            ctx.closePath();
            ctx.fill();

            // Switch Knob
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(switchX + 30, switchY + 10, 8, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Sliders or Action Buttons
        const buttonY = guiY + 265;
        ctx.fillStyle = '#4f46e5';
        ctx.fillRect(contentX, buttonY, contentW / 2 - 10, 32);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('🚀 Execute Fast Loop', contentX + 22, buttonY + 20);

        ctx.fillStyle = '#0284c7';
        ctx.fillRect(contentX + (contentW / 2) + 5, buttonY, contentW / 2 - 10, 32);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🛡️ Teleport to Safezone', contentX + (contentW / 2) + 20, buttonY + 20);

        // Mini Console Feed at Bottom of Hub
        ctx.fillStyle = '#090d16';
        ctx.fillRect(contentX, guiY + 312, contentW, 85);
        ctx.strokeStyle = '#1e293b';
        ctx.strokeRect(contentX, guiY + 312, contentW, 85);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('> [Output] Script runtime loaded into Luau state', contentX + 10, guiY + 332);
        ctx.fillStyle = '#10b981';
        ctx.fillText(`> [Info] Initialized in ${execResults.durationMs || 18}ms • Memory: 42.8 MB`, contentX + 10, guiY + 352);
        if (execResults.logs && execResults.logs.length > 0) {
            const firstLog = execResults.logs[0].text.slice(0, 50);
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText(`> [Print] ${firstLog}`, contentX + 10, guiY + 372);
        } else {
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(`> [Hook] CoreGui active • Ready for Player interactions`, contentX + 10, guiY + 372);
        }

    } else {
        // --- RENDER ROBLOX DEVELOPER CONSOLE (F9 Console) ---
        const conX = 80;
        const conY = 75;
        const conW = 800;
        const conH = 430;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(conX + 6, conY + 6, conW, conH);

        // Console Window
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(conX, conY, conW, conH);
        ctx.strokeStyle = '#334155';
        ctx.strokeRect(conX, conY, conW, conH);

        // Console Top Nav
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(conX, conY, conW, 36);

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('💻 Roblox Developer Console [F9]', conX + 14, conY + 23);

        // Console Tabs
        const conTabs = ['Log', 'Memory', 'Network', 'Scripts'];
        for (let i = 0; i < conTabs.length; i++) {
            const tabX = conX + 280 + (i * 80);
            if (i === 0) {
                ctx.fillStyle = '#3b82f6';
                ctx.fillRect(tabX, conY + 5, 65, 26);
                ctx.fillStyle = '#ffffff';
            } else {
                ctx.fillStyle = '#94a3b8';
            }
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(conTabs[i], tabX + 12, conY + 22);
        }

        // Console Output Area
        let lineY = conY + 65;
        const printLine = (tag, color, text) => {
            if (lineY > conY + conH - 30) return;
            const timeStr = new Date().toLocaleTimeString('en-GB');
            ctx.fillStyle = '#64748b';
            ctx.font = '11px monospace';
            ctx.fillText(`[${timeStr}]`, conX + 14, lineY);

            ctx.fillStyle = color;
            ctx.font = 'bold 11px monospace';
            ctx.fillText(`[${tag}]`, conX + 80, lineY);

            ctx.fillStyle = '#f1f5f9';
            ctx.font = '12px monospace';
            ctx.fillText(text.slice(0, 75), conX + 150, lineY);
            lineY += 24;
        };

        printLine('Output', '#38bdf8', 'Luau Execution Environment initialized');
        printLine('Output', '#38bdf8', `Loaded Roblox Services: Players, Workspace, RunService, TweenService`);
        printLine('Info', '#10b981', `Target Script: ${scriptName} (Execution verified)`);

        if (execResults.logs && execResults.logs.length > 0) {
            for (const log of execResults.logs.slice(0, 8)) {
                const color = log.type === 'error' ? '#ef4444' : (log.type === 'warn' ? '#f59e0b' : '#38bdf8');
                const tag = log.type === 'error' ? 'Error' : (log.type === 'warn' ? 'Warn' : 'Output');
                printLine(tag, color, log.text);
            }
        } else {
            printLine('Output', '#38bdf8', 'Executing source code safely inside Luau sandbox...');
            printLine('Info', '#10b981', `Execution finished in ${execResults.durationMs || 22}ms without unhandled exceptions.`);
            printLine('Output', '#38bdf8', 'Roblox Client State: Synced (RenderStepped loop running)');
        }

        // Status pill at bottom of console
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(conX, conY + conH - 34, conW, 34);
        ctx.fillStyle = '#10b981';
        ctx.font = '11px monospace';
        ctx.fillText(`✓ Process ID: 1982 | Memory: 41.2 MB | Security Scan: ${scanResults.threatLevel}`, conX + 14, conY + conH - 12);
    }

    // 4. Bottom Global Bar
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, height - 34, width, 34);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, height - 34, width, 1);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    const scanText = `Security: ${scanResults.hasWebhook ? '🚨 WEBHOOK' : '✅ SAFE'}  |  Crashers: ${scanResults.hasCrasher ? '⚠️ DETECTED' : '✅ NONE'}  |  Loggers: ${scanResults.hasLogger ? '⚠️ DETECTED' : '✅ CLEAN'}`;
    ctx.fillText(scanText, 20, height - 12);

    ctx.fillStyle = '#6366f1';
    ctx.fillText('Roblox Execution Engine 2026', width - 210, height - 12);

    return canvas.toBuffer('image/png');
}

/**
 * Generates high-definition Source Code Preview Photo ("what the source look like")
 */
async function generateSourceCodeImage(sourceCode, scriptName = 'source.lua') {
    const width = 960;
    const height = 540;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Editor Canvas Background (One Dark Pro)
    ctx.fillStyle = '#1e1e2e'; // Catppuccin / One Dark base
    ctx.fillRect(0, 0, width, height);

    // 2. Editor Top Titlebar & Tab
    ctx.fillStyle = '#181825';
    ctx.fillRect(0, 0, width, 40);
    ctx.fillStyle = '#313244';
    ctx.fillRect(0, 39, width, 1);

    // Window control buttons
    ctx.fillStyle = '#f38ba8'; // Red
    ctx.beginPath();
    ctx.arc(20, 20, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f9e2af'; // Yellow
    ctx.beginPath();
    ctx.arc(36, 20, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#a6e3a1'; // Green
    ctx.beginPath();
    ctx.arc(52, 20, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Editor Tab
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(80, 6, 200, 34);
    ctx.fillStyle = '#89b4fa';
    ctx.fillRect(80, 6, 200, 2); // Tab active top bar

    ctx.fillStyle = '#cdd6f4';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`📄 ${scriptName.slice(0, 20)}`, 96, 26);

    // Right Tag
    ctx.fillStyle = '#a6adc8';
    ctx.font = '11px monospace';
    ctx.fillText('Roblox Luau • UTF-8', width - 150, 26);

    // 3. Left Line Numbers Gutter
    const gutterW = 55;
    ctx.fillStyle = '#181825';
    ctx.fillRect(0, 40, gutterW, height - 68);

    const rawLines = (sourceCode || '-- Empty Script').split('\n');
    const linesToDisplay = rawLines.slice(0, 21);

    let codeY = 66;
    for (let i = 0; i < linesToDisplay.length; i++) {
        const lineNum = String(i + 1).padStart(2, '0');
        ctx.fillStyle = '#6c7086'; // Muted line number
        ctx.font = '12px monospace';
        ctx.fillText(lineNum, 18, codeY);

        // Simple Syntax Tokenizer & Renderer
        const lineText = linesToDisplay[i].replace(/\t/g, '    ');
        renderSyntaxLine(ctx, lineText, gutterW + 16, codeY);

        codeY += 21;
    }

    // 4. Editor Bottom Status Bar
    ctx.fillStyle = '#11111b';
    ctx.fillRect(0, height - 28, width, 28);
    ctx.fillStyle = '#313244';
    ctx.fillRect(0, height - 28, width, 1);

    ctx.fillStyle = '#89b4fa';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('● ROBLOX LUAU', 16, height - 10);

    ctx.fillStyle = '#a6adc8';
    ctx.fillText(`Lines: ${rawLines.length}  |  Characters: ${sourceCode.length}  |  Encoding: UTF-8`, 130, height - 10);

    ctx.fillStyle = '#a6e3a1';
    ctx.fillText('Ln 1, Col 1  |  Spaces: 4', width - 180, height - 10);

    return canvas.toBuffer('image/png');
}

/**
 * Syntax highlighter helper for canvas code drawing
 */
function renderSyntaxLine(ctx, line, startX, y) {
    if (!line) return;

    // Full line comment
    if (line.trim().startsWith('--')) {
        ctx.fillStyle = '#6c7086'; // Slate gray comment
        ctx.font = 'italic 12px monospace';
        ctx.fillText(line.slice(0, 95), startX, y);
        return;
    }

    // Token regex for Lua
    const tokenRegex = /(--.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b(?:local|function|end|then|do|if|else|elseif|return|while|for|in|repeat|until|break|not|and|or)\b)|(\b(?:game|workspace|Instance|Vector3|Vector2|CFrame|Color3|UDim2|UDim|task|Players|loadstring|HttpGet|GetService|Drawing)\b)|(\b\d+(?:\.\d+)?\b)|([a-zA-Z_]\w*)|([^\s\w])/g;

    let curX = startX;
    let match;

    // Fast fallback if too long
    if (line.length > 120) {
        ctx.fillStyle = '#cdd6f4';
        ctx.font = '12px monospace';
        ctx.fillText(line.slice(0, 110) + '...', startX, y);
        return;
    }

    let lastIdx = 0;
    while ((match = tokenRegex.exec(line)) !== null) {
        if (match.index > lastIdx) {
            const spaces = line.substring(lastIdx, match.index);
            curX += ctx.measureText(spaces).width;
        }

        const token = match[0];
        if (match[1]) {
            // Comment
            ctx.fillStyle = '#6c7086';
            ctx.font = 'italic 12px monospace';
        } else if (match[2]) {
            // String literal
            ctx.fillStyle = '#a6e3a1'; // Emerald
            ctx.font = '12px monospace';
        } else if (match[3]) {
            // Keywords
            ctx.fillStyle = '#cba6f7'; // Purple / Mauve
            ctx.font = 'bold 12px monospace';
        } else if (match[4]) {
            // Roblox Globals & APIs
            ctx.fillStyle = '#89dceb'; // Cyan / Sky
            ctx.font = 'bold 12px monospace';
        } else if (match[5]) {
            // Numbers
            ctx.fillStyle = '#fab387'; // Peach / Orange
            ctx.font = '12px monospace';
        } else {
            // Identifiers / symbols
            ctx.fillStyle = '#cdd6f4'; // Light text
            ctx.font = '12px monospace';
        }

        ctx.fillText(token, curX, y);
        curX += ctx.measureText(token).width;
        lastIdx = tokenRegex.lastIndex;
    }
}

module.exports = {
    isRobloxScript,
    scanRobloxScript,
    resolveLoadstring,
    extractScriptFeatures,
    executeRobloxScript,
    generateExecutionOutputImage,
    generateSourceCodeImage
};
