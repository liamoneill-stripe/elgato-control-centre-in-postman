// Create the visualizer HTML
var template = `
<style>
    body { 
        font-family: Arial, sans-serif; 
        background-color: #1e1e1e; 
        color: #ffffff;
        padding: 20px;
    }
    .light-control, .all-lights-control { 
        margin: 10px; 
        padding: 10px; 
        border: 1px solid #333; 
        border-radius: 5px; 
        background-color: #2a2a2a;
    }
    .all-lights-control {
        width: 45%;
        margin: 0 auto 20px auto;
    }
    .controls-container {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
    }
    .light-control {
        width: calc(45% - 20px);
    }
    .slider-container {
        display: flex;
        align-items: center;
        margin: 10px 0;
    }
    .slider {
        -webkit-appearance: none;
        width: 100%;
        height: 10px;
        border-radius: 5px;
        outline: none;
        opacity: 0.7;
        transition: opacity .2s;
    }
    .slider:hover {
        opacity: 1;
    }
    .slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #ffffff;
        cursor: pointer;
    }
    .temp-slider {
        background: linear-gradient(to right, #ff6a00, #64b5f6);
    }
    .brightness-slider {
        background: linear-gradient(to right, #000000, #ff6a00);
    }
    .on-off-button {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        font-size: 20px;
        color: #ffffff;
        margin-right: 10px;
    }
    .temp-icon {
        font-size: 24px;
        margin: 0 10px;
    }
</style>
<div class="all-lights-control">
    <h2>All Lights</h2>
    <div id="allLightsControls"></div>
</div>
<div class="controls-container" id="individualLightControls"></div>
<div id="debug" style="display:none;"></div>

<script>
    const lights = [
        ${pm.variables.get('light_ips_and_labels').split(',').map(light => {
    const [ip, label] = light.trim().split(':');
    return `{ip: '${ip}:9123', label: '${label}'}`;
}).join(',')}
    ];

    function log(message) {
        const debugElement = document.getElementById('debug');
        debugElement.innerHTML += \`<br>\${new Date().toLocaleTimeString()} - \${message}\`;
        debugElement.scrollTop = debugElement.scrollHeight;
    }

    function kelvinToElgatoScale(kelvin) {
        kelvin = Math.min(Math.max(kelvin, 2900), 7000);
        return Math.round(344 + (kelvin - 2900) * (143 - 344) / (7000 - 2900));
    }

    function elgatoScaleToKelvin(value) {
        value = Math.min(Math.max(value, 143), 344);
        return Math.round(2900 + (value - 344) * (7000 - 2900) / (143 - 344));
    }

    function kelvinToColor(kelvin) {
        // ... (kelvinToColor function remains the same)
    }

    async function sendRequest(ip, method, body = null) {
        const url = \`http://\${ip}/elgato/lights\`;
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        log(\`Sending \${method} request to \${ip}: \${body ? JSON.stringify(body) : ''}\`);
        
        try {
            const response = await fetch(url, options);
            const data = await response.json();
            log(\`Response from \${ip}: \${JSON.stringify(data)}\`);
            return data;
        } catch (error) {
            log(\`Error with \${ip}: \${error.message}\`);
            throw error;
        }
    }

    async function getLightStatus(ip) {
        return sendRequest(ip, 'GET');
    }

    async function setLightSettings(ip, settings) {
        if (settings.temperature && typeof settings.temperature === 'number' && settings.temperature > 1000) {
            settings.temperature = kelvinToElgatoScale(settings.temperature);
        }
        const response = await sendRequest(ip, 'PUT', { numberOfLights: 1, lights: [settings] });
        updateLightUI(ip, response.lights[0]);
    }

    function updateLightUI(ip, lightData) {
        const element = document.getElementById(\`light-\${ip}\`);
        if (!element) return;

        const kelvinTemp = elgatoScaleToKelvin(lightData.temperature);
        
        const onOffButton = element.querySelector('.on-off-button');
        onOffButton.style.backgroundColor = lightData.on ? kelvinToColor(kelvinTemp) : '#333333';
        onOffButton.innerHTML = lightData.on ? '⏻' : '⭘';
        
        element.querySelector('.brightness-slider').value = lightData.brightness;
        element.querySelector('.temp-slider').value = kelvinTemp;
    }

    async function toggleLight(ip) {
        const status = await getLightStatus(ip);
        await setLightSettings(ip, { on: status.lights[0].on ? 0 : 1 });
        updateAllLightsButtonState();
    }

    async function controlAllLights(settings) {
        await Promise.all(lights.map(light => setLightSettings(light.ip, settings)));
        updateAllLightsButtonState();
    }

    async function toggleAllLights() {
        const statuses = await Promise.all(lights.map(light => getLightStatus(light.ip)));
        const allOn = statuses.every(status => status.lights[0].on);
        await controlAllLights({ on: allOn ? 0 : 1 });
    }

    async function updateAllLightsButtonState() {
        const statuses = await Promise.all(lights.map(light => getLightStatus(light.ip)));
        const allOn = statuses.every(status => status.lights[0].on);
        const allOff = statuses.every(status => !status.lights[0].on);
        const averageTemp = statuses.reduce((sum, status) => sum + elgatoScaleToKelvin(status.lights[0].temperature), 0) / statuses.length;
        
        const allLightsButton = document.querySelector('#allLightsControls .on-off-button');
        if (allOn) {
            allLightsButton.style.backgroundColor = kelvinToColor(averageTemp);
            allLightsButton.innerHTML = '⏻';
        } else if (allOff) {
            allLightsButton.style.backgroundColor = '#333333';
            allLightsButton.innerHTML = '⭘';
        } else {
            allLightsButton.style.backgroundColor = '#666666';
            allLightsButton.innerHTML = '⏼';
        }
    }

    function createLightControls() {
        const allLightsContainer = document.getElementById('allLightsControls');
        const individualContainer = document.getElementById('individualLightControls');
        
        // All Lights Controls
        allLightsContainer.innerHTML = \`
            <button class="on-off-button off" onclick="toggleAllLights()">⭘</button>
            <div class="slider-container">
                <span class="temp-icon">🔥</span>
                <input type="range" min="2900" max="7000" value="5600" class="slider temp-slider"
                    oninput="controlAllLights({temperature: parseInt(this.value)})">
                <span class="temp-icon">❄️</span>
            </div>
            <div class="slider-container">
                <span class="temp-icon">🔅</span>
                <input type="range" min="0" max="100" value="50" class="slider brightness-slider"
                    oninput="controlAllLights({brightness: parseInt(this.value)})">
                <span class="temp-icon">🔆</span>
            </div>
        \`;

        // Individual Light Controls
        lights.forEach(light => {
            individualContainer.innerHTML += \`
                <div id="light-\${light.ip}" class="light-control">
                    <h3>\${light.label}</h3>
                    <button class="on-off-button off" onclick="toggleLight('\${light.ip}')">⭘</button>
                    <div class="slider-container">
                        <span class="temp-icon">🔥</span>
                        <input type="range" min="2900" max="7000" value="5600" class="slider temp-slider"
                            oninput="setLightSettings('\${light.ip}', {temperature: parseInt(this.value)})">
                        <span class="temp-icon">❄️</span>
                    </div>
                    <div class="slider-container">
                        <span class="temp-icon">🔅</span>
                        <input type="range" min="0" max="100" value="50" class="slider brightness-slider"
                            oninput="setLightSettings('\${light.ip}', {brightness: parseInt(this.value)})">
                        <span class="temp-icon">🔆</span>
                    </div>
                </div>
            \`;
        });

        // Initialize all controls
        Promise.all(lights.map(light => getLightStatus(light.ip)))
            .then(statuses => {
                statuses.forEach((status, index) => updateLightUI(lights[index].ip, status.lights[0]));
                updateAllLightsButtonState();
            });
    }

    createLightControls();
</script>
`;

// Set the visualizer template
pm.visualizer.set(template);

console.log('Script loaded. Lights:', pm.variables.get('light_ips_and_labels'));

