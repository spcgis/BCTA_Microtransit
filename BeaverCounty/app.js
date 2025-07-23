require([
    "esri/Map",
    "esri/views/MapView",
    "esri/layers/FeatureLayer",
    "esri/widgets/Legend",
    "esri/widgets/Expand"
], function(Map, MapView, FeatureLayer, Legend, Expand) {

    // Initialize map with neutral basemap
    const map = new Map({
        basemap: "gray-vector"
    });

    const view = new MapView({
        container: "viewDiv",
        map: map,
        center: [-80.3192, 40.6495], // Beaver County coordinates
        zoom: 10
    });

    // Initialize state variables
    let selectedOrigins = new Set();
    let tripData = {};
    let clickCount = {};
    let selectedDay = "";
    let selectedTime = "";

    // Create tooltip
    const tooltip = document.createElement("div");
    tooltip.id = "tripTooltip";
    tooltip.style.cssText = `
        display: none;
        position: fixed;
        background-color: white;
        padding: 5px;
        border: 1px solid black;
        border-radius: 3px;
        z-index: 1000;
        pointer-events: none;
        font-family: Arial, sans-serif;
        font-size: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(tooltip);

    // Create filter container
    const filterDiv = document.createElement("div");
    filterDiv.id = "filterContainer";
    filterDiv.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        background: white;
        padding: 10px;
        border-radius: 3px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        z-index: 1000;
    `;

    filterDiv.innerHTML = `
        <div style="margin-bottom: 10px;">
            <label for="daySelect">Day of Week:</label>
            <select id="daySelect" style="border: ${selectedDay ? '1px solid #ccc' : '1px solid #ff6b6b'}">
                <option value="">Select Day</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
            </select>
        </div>
        <div>
            <label for="timeSelect">Time Period:</label>
            <select id="timeSelect" disabled style="border: ${selectedTime ? '1px solid #ccc' : '1px solid #ff6b6b'}">
                <option value="">Select Time</option>
                <option value="01: 6am (6am-7am)">6am-7am</option>
                <option value="02: 7am (7am-8am)">7am-8am</option>
                <option value="03: 8am (8am-9am)">8am-9am</option>
                <option value="04: 9am (9am-10am)">9am-10am</option>
                <option value="05: 10am (10am-11am)">10am-11am</option>
                <option value="06: 11am (11am-12noon)">11am-12pm</option>
                <option value="07: 12pm (12noon-1pm)">12pm-1pm</option>
                <option value="08: 1pm (1pm-2pm)">1pm-2pm</option>
                <option value="09: 2pm (2pm-3pm)">2pm-3pm</option>
                <option value="10: 3pm (3pm-4pm)">3pm-4pm</option>
                <option value="11: 4pm (4pm-5pm)">4pm-5pm</option>
                <option value="12: 5pm (5pm-6pm)">5pm-6pm</option>
                <option value="13: 6pm (6pm-7pm)">6pm-7pm</option>
                <option value="14: 7pm (7pm-8pm)">7pm-8pm</option>
                <option value="15: 8pm (8pm-9pm)">8pm-9pm</option>
                <option value="16: 9pm (9pm-10pm)">9pm-10pm</option>
                <option value="17: 10pm (10pm-11pm)">10pm-11pm</option>
            </select>
        </div>
    `;
    view.ui.add(filterDiv, "top-right");

    // Define the class breaks renderer
    const tripsRenderer = {
        type: "class-breaks",
        field: "Average_Daily_O_D_Traffic__StL_",
        defaultSymbol: {
            type: "simple-fill",
            color: [0, 0, 0, 0], // transparent for no trips
            outline: { color: [128, 128, 128], width: 0.5 }
        },
        classBreakInfos: [
            {
                minValue: 1,
                maxValue: 5,
                symbol: {
                    type: "simple-fill",
                    color: [255, 241, 169, 0.7],
                    outline: { color: [128, 128, 128], width: 0.5 }
                },
                label: "1-5 trips"
            },
            {
                minValue: 6,
                maxValue: 15,
                symbol: {
                    type: "simple-fill",
                    color: [254, 204, 92, 0.7],
                    outline: { color: [128, 128, 128], width: 0.5 }
                },
                label: "6-15 trips"
            },
            {
                minValue: 16,
                maxValue: 25,
                symbol: {
                    type: "simple-fill",
                    color: [253, 141, 60, 0.7],
                    outline: { color: [128, 128, 128], width: 0.5 }
                },
                label: "16-25 trips"
            },
            {
                minValue: 26,
                maxValue: 50,
                symbol: {
                    type: "simple-fill",
                    color: [240, 59, 32, 0.7],
                    outline: { color: [128, 128, 128], width: 0.5 }
                },
                label: "26-50 trips"
            },
            {
                minValue: 51,
                maxValue: 99999,
                symbol: {
                    type: "simple-fill",
                    color: [189, 0, 38, 0.7],
                    outline: { color: [128, 128, 128], width: 0.5 }
                },
                label: ">50 trips"
            }
        ]
    };

    // Default green renderer for block groups
    const greenRenderer = {
        type: "simple",
        symbol: {
            type: "simple-fill",
            color: [180, 230, 180, 0.6], // light green
            outline: { color: [0, 128, 0], width: 1 }
        }
    };

    // Layer for block group outlines (green)
    const blockGroupOutlineLayer = new FeatureLayer({
        url: "https://services3.arcgis.com/MV5wh5WkCMqlwISp/arcgis/rest/services/BeaverCounty_Merge/FeatureServer/0",
        id: "BlockGroupOutline",
        outFields: ["*"],
        visible: true,
        opacity: 0.7,
        renderer: greenRenderer
    });

    // Layer for trips (class breaks)
    const blockGroupTripsLayer = new FeatureLayer({
        url: "https://services3.arcgis.com/MV5wh5WkCMqlwISp/arcgis/rest/services/BeaverCounty_Merge/FeatureServer/0",
        id: "BlockGroupTrips",
        outFields: ["*"],
        visible: true,
        opacity: 0.7,
        renderer: tripsRenderer
    });

    // Add both layers to the map (order matters: outlines first, trips second)
    map.add(blockGroupOutlineLayer);
    map.add(blockGroupTripsLayer);

    // Create feature layers
    const beaverCountyBG = new FeatureLayer({
        url: "https://services3.arcgis.com/MV5wh5WkCMqlwISp/arcgis/rest/services/BeaverCounty_Merge/FeatureServer/0",
        id: "BeaverCounty_BG",
        outFields: ["*"],
        visible: true,
        opacity: 0.7,
        renderer: tripsRenderer  // Apply the renderer here
    });

    beaverCountyBG.when(() => {
        console.log("BeaverCounty layer fields:", 
            beaverCountyBG.fields.map(f => ({name: f.name, type: f.type}))
        );
    });

    // Modify the getODTableURL function
    function getODTableURL(day) {
        if (!day) return null;
        
        // Use the correct URL format that worked in testing
        return `https://services3.arcgis.com/MV5wh5WkCMqlwISp/arcgis/rest/services/BeaverCounty_Merge/FeatureServer/${day}`;
    }

    // Modify the OD table setup
    let odTable = new FeatureLayer({
        url: getODTableURL("1"),
        id: "OD_Table",
        outFields: ["*"],
        visible: false,
        opacity: 0.7,
        definitionExpression: "1=1"
    });

    odTable.when(() => {
        console.log("OD Table fields:", 
            odTable.fields.map(f => ({name: f.name, type: f.type}))
        );
    });

    map.add(beaverCountyBG);

    // Update the legend configuration
    const legend = new Legend({
        view: view,
        style: "classic",
        layerInfos: [
            {
                layer: blockGroupTripsLayer,
                title: "Number of Trips"
            },
            {
                layer: blockGroupOutlineLayer,
                title: "Block Groups"
            }
        ]
    });

    const legendExpand = new Expand({
        view: view,
        content: legend,
        expanded: true,
        expandIconClass: "esri-icon-legend",
        mode: "floating"
    });

    view.ui.add(legendExpand, "bottom-left");

    // Event handlers for filters
    document.getElementById("daySelect").addEventListener("change", function(e) {
        selectedDay = e.target.value;
        const timeSelect = document.getElementById("timeSelect");
        timeSelect.disabled = !selectedDay;
        if (!selectedDay) {
            timeSelect.value = "";
            selectedTime = "";
        }
        // Update visual feedback
        this.style.border = selectedDay ? '1px solid #ccc' : '1px solid #ff6b6b';
        timeSelect.style.border = selectedTime ? '1px solid #ccc' : '1px solid #ff6b6b';
        updateLayerFilter();
    });

    document.getElementById("timeSelect").addEventListener("change", function(e) {
        selectedTime = e.target.value;
        // Update visual feedback
        this.style.border = selectedTime ? '1px solid #ccc' : '1px solid #ff6b6b';
        updateLayerFilter();
    });

    // Function to update layer based on filters
    function updateLayerFilter() {
        if (!selectedDay) {
            console.log("No day selected, clearing graphics");
            view.graphics.removeAll();
            return;
        }

        const newUrl = getODTableURL(selectedDay);
        if (!newUrl) {
            console.error("Invalid day selected");
            return;
        }

        // Create new FeatureLayer instance instead of modifying URL
        odTable = new FeatureLayer({
            url: newUrl,
            id: "OD_Table",
            outFields: ["*"],
            visible: false,
            opacity: 0.7
        });

        let whereClause = "1=1";
        if (selectedTime) {
            whereClause += ` AND Day_Part = '${selectedTime}'`;
        }

        odTable.definitionExpression = whereClause;

        // Wait for layer to load before querying
        odTable.load().then(() => {
            odTable.queryFeatureCount({
                where: whereClause
            }).then(count => {
                console.log(`Found ${count} records in table for day ${selectedDay}${selectedTime ? `, time ${selectedTime}` : ''}`);
            });
        }).catch(error => {
            console.error("Error loading new OD table:", error);
        });

        // Clear existing selections
        selectedOrigins.clear();
        tripData = {};
        clickCount = {};
        view.graphics.removeAll();
    }

    // Click handler
    view.on("click", function(event) {
        // Validate both day and time filters
        if (!selectedDay) {
            alert("Please select a Day of Week first");
            return;
        }
        
        if (!selectedTime) {
            alert("Please select a Time Period");
            return;
        }
        
        view.hitTest(event).then(function(response) {
            const result = response.results.find(r =>
                r.graphic?.layer?.id === "BeaverCounty_BG"
            );
            if (!result) {
                if (document.getElementById("sidePanel")) {
                    document.getElementById("sidePanel").style.display = "none";
                }
                return;
            }

            const clickedBGId = result.graphic.attributes.GEOID;
            if (!clickedBGId) {
                console.error("No GEOID found in clicked feature");
                return;
            }

            // Click tracking - simplified to just toggle selection
            if (selectedOrigins.has(clickedBGId)) {
                // If already selected, remove it
                selectedOrigins.delete(clickedBGId);
                delete tripData[clickedBGId];
                updateDisplay();
                return;
            }

            // If not selected, add it
            selectedOrigins.add(clickedBGId);

            // Query OD table for trips
            console.log("Querying OD table with:", {
                url: odTable.url,
                selectedDay: selectedDay,
                query: `Origin_ID_Text = '${clickedBGId}'${selectedTime ? ` AND Day_Part = '${selectedTime}'` : ''}`
            });

            const query = {
                where: `Origin_ID_Text = '${clickedBGId}'${selectedTime ? ` AND Day_Part = '${selectedTime}'` : ''}`,
                outFields: ["Destination_Zone_ID", "Average_Daily_O_D_Traffic__StL_"],
                returnGeometry: false
            };

            odTable.queryFeatures(query).then(function(results) {
                console.log("Query results:", {
                    originId: clickedBGId,
                    featuresFound: results.features.length,
                    url: odTable.url
                });
                if (!results.features.length) {
                    console.log("No destinations found for origin:", clickedBGId);
                    return;
                }

                tripData[clickedBGId] = {};
                results.features.forEach(f => {
                    const destId = f.attributes.Destination_Zone_ID.toString();
                    tripData[clickedBGId][destId] = f.attributes.Average_Daily_O_D_Traffic__StL_;
                });

                updateDisplay();
            }).catch(error => {
                console.error("Error querying OD table:", error);
            });
        }).catch(error => {
            console.error("Error in hitTest:", error);
        });
    });

    // Modify the updateDisplay function
    function updateDisplay() {
        view.graphics.removeAll();

        if (selectedOrigins.size === 0) {
            document.getElementById("sidePanel").style.display = "none";
            return;
        }

        const originIds = Array.from(selectedOrigins).map(id => `'${id}'`).join(",");
        const originQuery = beaverCountyBG.createQuery();
        originQuery.where = `GEOID IN (${originIds})`;
        originQuery.outFields = ["GEOID"];

        beaverCountyBG.queryFeatures(originQuery).then(function(originResults) {
            // Highlight origins
            originResults.features.forEach(function(f) {
                view.graphics.add({
                    geometry: f.geometry,
                    symbol: {
                        type: "simple-fill",
                        color: [255, 0, 0, 0.3],
                        outline: { 
                            color: [255, 0, 0], 
                            width: 2 
                        }
                    }
                });
            });

            // Calculate combined trips for all destinations
            let combinedTrips = {};
            Object.values(tripData).forEach(originData => {
                Object.entries(originData).forEach(([destId, trips]) => {
                    combinedTrips[destId] = (combinedTrips[destId] || 0) + trips;
                });
            });

            // Update side panel content
            updateSidePanel(originResults.features, combinedTrips);

            // Query and highlight destinations
            const destQuery = beaverCountyBG.createQuery();
            const destIds = Object.keys(combinedTrips);
            if (destIds.length === 0) return;

            destQuery.where = `GEOID IN (${destIds.join(",")})`;
            destQuery.outFields = ["GEOID"];

            beaverCountyBG.queryFeatures(destQuery).then(function(destResults) {
                destResults.features.forEach(function(f) {
                    const tripCount = combinedTrips[f.attributes.GEOID] || 0;
                    const color = getColorFromRenderer(tripCount);
                    
                    view.graphics.add({
                        geometry: f.geometry,
                        symbol: {
                            type: "simple-fill",
                            color: color,
                            outline: { color: [0, 0, 255], width: 1 }
                        }
                    });
                });
            });
        });
    }

    // Function to update side panel content
    function updateSidePanel(originFeatures, combinedTrips) {
        const sidePanel = document.getElementById("sidePanel") || createSidePanel();
        let content = `
            <div style="text-align: right;">
                <button onclick="this.parentElement.parentElement.style.display='none'" 
                        style="border: none; background: none; cursor: pointer;">✕</button>
            </div>
            <h3>Selected Block Groups</h3>
        `;

        originFeatures.forEach(feature => {
            const bgId = feature.attributes.GEOID;
            const totalTrips = Object.values(tripData[bgId] || {}).reduce((sum, trips) => sum + trips, 0);
            
            content += `
                <div style="margin-bottom: 10px;">
                    <p><strong>Block Group:</strong> ${bgId}</p>
                    <p><strong>Total Outbound Trips:</strong> ${totalTrips}</p>
                    <hr>
                </div>
            `;
        });

        sidePanel.innerHTML = content;
        sidePanel.style.display = "block";
    }

    // Function to create side panel if it doesn't exist
    function createSidePanel() {
        const sidePanel = document.createElement("div");
        sidePanel.id = "sidePanel";
        sidePanel.style.cssText = `
            position: absolute;
            top: 20px;
            left: 20px;
            background: white;
            padding: 15px;
            border-radius: 3px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            max-width: 300px;
            z-index: 1000;
            display: none;
        `;
        document.body.appendChild(sidePanel);
        return sidePanel;
    }

    // Add pointer-move handler for tooltips
    view.on("pointer-move", function(event) {
        if (selectedOrigins.size === 0) {
            tooltip.style.display = "none";
            return;
        }

        view.hitTest(event).then(function(response) {
            const result = response.results.find(r =>
                r.graphic && r.graphic.layer && r.graphic.layer.id === "BeaverCounty_BG"
            );
            if (!result) {
                tooltip.style.display = "none";
                return;
            }

            const hoveredBGId = result.graphic.attributes.GEOID;
            let totalTrips = 0;
            
            Object.values(tripData).forEach(originData => {
                totalTrips += originData[hoveredBGId] || 0;
            });

            if (totalTrips > 0) {
                tooltip.style.left = event.x + 10 + "px";
                tooltip.style.top = event.y + 10 + "px";
                tooltip.style.display = "block";
                tooltip.innerHTML = `Total Trips: ${totalTrips}`;
            } else {
                tooltip.style.display = "none";
            }
        });
    });

    // Hide tooltip when moving the map
    view.on("drag", function() {
        tooltip.style.display = "none";
    });

    // Initialize side panel
    createSidePanel();

    function getColorFromRenderer(tripCount) {
        const breakInfo = tripsRenderer.classBreakInfos.find(info => 
            tripCount >= info.minValue && tripCount <= info.maxValue
        );
        return breakInfo ? breakInfo.symbol.color : tripsRenderer.defaultSymbol.color;
    }
});