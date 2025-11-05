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
    let selectedMode = "internal";

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

    // Update filterDiv innerHTML to include the mode selection dropdown
    filterDiv.innerHTML = `
    <div style="margin-bottom: 10px;">
        <label for="modeSelect">Trip Type:</label>
        <select id="modeSelect" style="border: 1px solid #ccc">
            <option value="internal">Home to Work</option>
            <option value="external">Home to Other</option>
            <option value="external">Non Home Based Trips</option>
        </select>
    </div>
    <div style="margin-bottom: 10px;">
        <label for="daySelect">Day of Week:</label>
        <select id="daySelect" style="border: ${selectedDay ? '1px solid #ccc' : '1px solid #ff6b6b'}">
            <option value="">Select Day</option>
            <option value="0: All Days (M-Su)">All (Mon-Sat)</option>
            <option value="1: Monday (M-M)">Monday</option>
            <option value="2: Tuesday (Tu-Tu)">Tuesday</option>
            <option value="3: Wednesday (W-W)">Wednesday</option>
            <option value="4: Thursday (Th-Th)">Thursday</option>
            <option value="5: Friday (F-F)">Friday</option>
            <option value="6: Saturday (Sa-Sa)">Saturday</option>
            <option value="7: Sunday (Su-Su)">Sunday</option>
        </select>
    </div>
    <div>
        <label for="timeSelect">Time Period:</label>
        <select id="timeSelect" disabled style="border: ${selectedTime ? '1px solid #ccc' : '1px solid #ff6b6b'}">
            <option value="">Select Time</option>
            <option value="ALL">All Times (6am-11pm)</option>
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
            color: [180, 230, 180, 0.6], // transparent for no trips
            outline: { color: [0, 128, 0], width: 1 }
        },
        classBreakInfos: [
            {
                minValue: 1,
                maxValue: 5,
                symbol: {
                    type: "simple-fill",
                    color: [255, 241, 169, 0.7],
                    outline: { color: [0, 128, 0], width: 1 }
                },
                label: "1-5 trips"
            },
            {
                minValue: 6,
                maxValue: 15,
                symbol: {
                    type: "simple-fill",
                    color: [254, 204, 92, 0.7],
                    outline: { color: [0, 128, 0], width: 1 }
                },
                label: "6-15 trips"
            },
            {
                minValue: 16,
                maxValue: 25,
                symbol: {
                    type: "simple-fill",
                    color: [253, 141, 60, 0.7],
                    outline: { color: [0, 128, 0], width: 1 }
                },
                label: "16-25 trips"
            },
            {
                minValue: 26,
                maxValue: 50,
                symbol: {
                    type: "simple-fill",
                    color: [240, 59, 32, 0.7],
                    outline: { color: [0, 128, 0], width: 1 }
                },
                label: "26-50 trips"
            },
            {
                minValue: 51,
                maxValue: 99999,
                symbol: {
                    type: "simple-fill",
                    color: [189, 0, 38, 0.7],
                    outline: { color: [0, 128, 0], width: 1 }
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
        url: "https://services3.arcgis.com/MV5wh5WkCMqlwISp/ArcGIS/rest/services/BCTA_Trip_Purpose/FeatureServer/0",
        id: "BlockGroupOutline",
        outFields: ["*"],
        visible: true,
        opacity: 0.7,
        renderer: greenRenderer
    });

    // Layer for trips (class breaks)
    const blockGroupTripsLayer = new FeatureLayer({
        url: "https://services3.arcgis.com/MV5wh5WkCMqlwISp/ArcGIS/rest/services/BCTA_Trip_Purpose/FeatureServer/0",
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
        url: "https://services3.arcgis.com/MV5wh5WkCMqlwISp/ArcGIS/rest/services/BCTA_Trip_Purpose/FeatureServer/0",
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

    // Modify the getODTableURL function to use different layers based on mode
    function getODTableURL() {
        if (selectedMode === "internal") {
            // Internal trips (within Beaver County)
            return "https://services3.arcgis.com/MV5wh5WkCMqlwISp/ArcGIS/rest/services/BCTA_Trip_Purpose/FeatureServer/1";
        } else {
            // External trips (Beaver County to outside areas)
            return "https://services3.arcgis.com/MV5wh5WkCMqlwISp/ArcGIS/rest/services/BCTA_Trip_Purpose/FeatureServer/2";
        }
    }

    // Modify the OD table setup
    let odTable = new FeatureLayer({
        url: getODTableURL(),
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
        
        // Enable time selection for all options, including "All" (7)
        if (!selectedDay) {
            timeSelect.disabled = true;
            timeSelect.value = "";
            selectedTime = "";
        } else {
            // Always enable time selection regardless of day selection
            timeSelect.disabled = false;
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
        
        // Log the selection
        console.log("Selected time period:", selectedTime === "ALL" ? "All Times" : selectedTime);
        
        updateLayerFilter();
    });

    // Add event handler for mode selection
    document.getElementById("modeSelect").addEventListener("change", function(e) {
        selectedMode = e.target.value;
        console.log("Selected mode:", selectedMode);
        
        // Reset day and time selections when changing modes
        const daySelect = document.getElementById("daySelect");
        const timeSelect = document.getElementById("timeSelect");
        
        daySelect.value = "";
        selectedDay = "";
        timeSelect.value = "";
        selectedTime = "";
        timeSelect.disabled = true;
        
        // Update visual feedback
        daySelect.style.border = '1px solid #ff6b6b';
        timeSelect.style.border = '1px solid #ff6b6b';
        
        // Clear graphics and selections
        selectedOrigins.clear();
        tripData = {};
        clickCount = {};
        view.graphics.removeAll();
        
        // Hide side panel if visible
        if (document.getElementById("sidePanel")) {
            document.getElementById("sidePanel").style.display = "none";
        }
    });

    // Update the updateLayerFilter function to also update the legend title
    function updateLayerFilter() {
        if (!selectedDay) {
            console.log("No day selected, clearing graphics");
            view.graphics.removeAll();
            return;
        }

        // Create new FeatureLayer instance based on selected mode
        odTable = new FeatureLayer({
            url: getODTableURL(),
            id: "OD_Table",
            outFields: ["*"],
            visible: false,
            opacity: 0.7
        });

        // Special handling for "All Days" option
        let whereClause;
        if (selectedDay === "0: All Days (M-Su)") {
            // Include all weekdays (1-6) as there's no pre-aggregated data
            whereClause = "Day_Type IN ('1: Monday (M-M)', '2: Tuesday (Tu-Tu)', '3: Wednesday (W-W)', '4: Thursday (Th-Th)', '5: Friday (F-F)', '6: Saturday (Sa-Sa)', '7: Sunday (Su-Su)')";
        } else {
            // For specific days, use the selected day
            whereClause = `Day_Type = '${selectedDay}'`;
        }
        
        // Apply time filter only if not "ALL"
        if (selectedTime && selectedTime !== "ALL") {
            whereClause += ` AND Day_Part = '${selectedTime}'`;
        }

        odTable.definitionExpression = whereClause;

        // Wait for layer to load before querying
        odTable.load().then(() => {
            odTable.queryFeatureCount({
                where: whereClause
            }).then(count => {
                console.log(`Found ${count} records in table for day ${selectedDay}${selectedTime ? `, time ${selectedTime === 'ALL' ? 'All Times' : selectedTime}` : ''}`);
            });
        }).catch(error => {
            console.error("Error loading OD table:", error);
        });

        // Update legend title
        const modeText = selectedMode === "internal" ? "Within Beaver County" : "To External Areas";
        if (legendExpand && legendExpand.content) {
            legendExpand.content.layerInfos[0].title = `Number of Trips (${modeText})`;
        }

        // Clear existing selections
        selectedOrigins.clear();
        tripData = {};
        clickCount = {};
        view.graphics.removeAll();
    }

    // Click handler
    view.on("click", function(event) {
        // Validate filters
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

            // Click tracking - toggle selection
            if (selectedOrigins.has(clickedBGId)) {
                selectedOrigins.delete(clickedBGId);
                delete tripData[clickedBGId];
                updateDisplay();
                return;
            }

            // If not selected, add it
            selectedOrigins.add(clickedBGId);
            
            // Use the appropriate table URL
            const tableUrl = getODTableURL();
            
            // Create a new feature layer for the query
            const queryTable = new FeatureLayer({
                url: tableUrl,
                outFields: ["*"],
                visible: false
            });
            
            // Execute the appropriate query based on time and day selections
            if (selectedTime === "ALL") {
                // For "All Times" we need to query and sum ALL time periods
                
                // Special handling for "All Days" option
                let whereClause;
                if (selectedDay === "0: All Days (M-Su)") {
                    // Include all weekdays (1-6) as there's no pre-aggregated data
                    whereClause = `Origin = '${clickedBGId}' AND Day_Type IN ('1: Monday (M-M)', '2: Tuesday (Tu-Tu)', '3: Wednesday (W-W)', '4: Thursday (Th-Th)', '5: Friday (F-F)', '6: Saturday (Sa-Sa)', '7: Sunday (Su-Su)')`;
                } else {
                    // For specific days, use the selected day
                    whereClause = `Origin = '${clickedBGId}' AND Day_Type = '${selectedDay}'`;
                }
                
                console.log("Query for ALL times:", whereClause);
                
                queryTable.load().then(() => {
                    return queryTable.queryFeatures({
                        where: whereClause,
                        outFields: ["Destination_Zone_ID", "Average_Daily_O_D_Traffic__StL_", "Day_Part", "Day_Type"],
                        returnGeometry: false
                    });
                }).then(function(results) {
                    console.log("Query results:", {
                        originId: clickedBGId,
                        featuresFound: results.features.length
                    });
                    
                    if (!results.features.length) {
                        console.log("No destinations found for origin:", clickedBGId);
                        return;
                    }
                    
                    // Aggregate results by destination, summing across time periods AND days if needed
                    const aggregatedTrips = {};
                    results.features.forEach(f => {
                        const destId = f.attributes.Destination_Zone_ID.toString();
                        const trips = f.attributes.Average_Daily_O_D_Traffic__StL_;
                        
                        // If the day is "All Days", we should divide by the number of days
                        // to get a daily average (only if the original data represents totals)
                        // Otherwise, just sum as normal
                        aggregatedTrips[destId] = (aggregatedTrips[destId] || 0) + trips;
                    });
                    
                    // Store aggregated results
                    tripData[clickedBGId] = {};
                    Object.entries(aggregatedTrips).forEach(([destId, trips]) => {
                        tripData[clickedBGId][destId] = trips;
                    });
                    
                    console.log("Results summary (All Times):", {
                        originId: clickedBGId,
                        totalDestinations: Object.keys(aggregatedTrips).length,
                        totalTrips: Object.values(aggregatedTrips).reduce((sum, trips) => sum + trips, 0)
                    });
                    
                    updateDisplay();
                }).catch(error => {
                    console.error("Error querying all time periods:", error);
                });
            } else {
                // For specific time periods
                
                // Special handling for "All Days" option
                let whereClause;
                if (selectedDay === "0: All Days (M-Su)") {
                    // Include all weekdays (1-6) as there's no pre-aggregated data
                    whereClause = `Origin = '${clickedBGId}' AND Day_Type IN ('1: Monday (M-M)', '2: Tuesday (Tu-Tu)', '3: Wednesday (W-W)', '4: Thursday (Th-Th)', '5: Friday (F-F)', '6: Saturday (Sa-Sa)', '7: Sunday (Su-Su)') AND Day_Part = '${selectedTime}'`;
                } else {
                    // For specific days, use the selected day
                    whereClause = `Origin = '${clickedBGId}' AND Day_Type = '${selectedDay}' AND Day_Part = '${selectedTime}'`;
                }
                
                console.log("Query for specific time:", whereClause);
                
                const query = {
                    where: whereClause,
                    outFields: ["Destination_Zone_ID", "Average_Daily_O_D_Traffic__StL_", "Day_Type"],
                    returnGeometry: false
                };
                
                // Log the query details
                console.log("Query:", {
                    url: tableUrl,
                    where: whereClause,
                    day: selectedDay,
                    time: selectedTime
                });
                
                // Execute query
                queryTable.load().then(() => {
                    return queryTable.queryFeatures(query);
                }).then(function(results) {
                    console.log("Query results:", {
                        originId: clickedBGId,
                        featuresFound: results.features.length
                    });
                    
                    if (!results.features.length) {
                        console.log("No destinations found for origin:", clickedBGId);
                        return;
                    }
                    
                    // Aggregate results by destination
                    const aggregatedTrips = {};
                    results.features.forEach(f => {
                        const destId = f.attributes.Destination_Zone_ID.toString();
                        const trips = f.attributes.Average_Daily_O_D_Traffic__StL_;
                        aggregatedTrips[destId] = (aggregatedTrips[destId] || 0) + trips;
                    });
                    
                    // Store aggregated results
                    tripData[clickedBGId] = {};
                    Object.entries(aggregatedTrips).forEach(([destId, trips]) => {
                        tripData[clickedBGId][destId] = trips;
                    });
                    
                    console.log("Results summary:", {
                        originId: clickedBGId,
                        totalDestinations: Object.keys(aggregatedTrips).length,
                        totalTrips: Object.values(aggregatedTrips).reduce((sum, trips) => sum + trips, 0)
                    });
                    
                    updateDisplay();
                }).catch(error => {
                    console.error("Error querying data:", error);
                });
            }
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
            // Calculate combined trips for all destinations
            let combinedTrips = {};
            Object.values(tripData).forEach(originData => {
                Object.entries(originData).forEach(([destId, trips]) => {
                    combinedTrips[destId] = (combinedTrips[destId] || 0) + trips;
                });
            });

            // Update side panel content
            updateSidePanel(originResults.features, combinedTrips);

            // Query and highlight destinations (no borders)
            const destQuery = beaverCountyBG.createQuery();
            const destIds = Object.keys(combinedTrips);
            if (destIds.length === 0) return;

            destQuery.where = `GEOID IN (${destIds.join(",")})`;
            destQuery.outFields = ["GEOID"];

            beaverCountyBG.queryFeatures(destQuery).then(function(destResults) {
                // First, add all destinations with color fills but no borders
                destResults.features.forEach(function(f) {
                    const destId = f.attributes.GEOID;
                    const tripCount = combinedTrips[destId] || 0;
                    const color = getColorFromRenderer(tripCount);
                    
                    // Only add fill color, no border
                    view.graphics.add({
                        geometry: f.geometry,
                        symbol: {
                            type: "simple-fill",
                            color: color,
                            outline: { color: [0, 0, 0, 0], width: 0 } // Transparent border
                        }
                    });
                });
                
                // Then add prominent borders ONLY to selected origins (on top of fills)
                originResults.features.forEach(function(f) {
                    view.graphics.add({
                        geometry: f.geometry,
                        symbol: {
                            type: "simple-fill",
                            color: [0, 0, 0, 0], // Transparent fill
                            outline: { 
                                color: [255, 0, 0], // Bright red border
                                width: 3          // Thick border
                            }
                        }
                    });
                });
            });
        });
    }

    // Function to update side panel content
    function updateSidePanel(originFeatures, combinedTrips) {
        const sidePanel = document.getElementById("sidePanel") || createSidePanel();
        
        // Determine which mode is active for the header
        const modeTitle = selectedMode === "internal" ? 
            "Internal Trips (Within Beaver County)" : 
            "External Trips (To Outside Areas)";
        
        let content = `
            <div style="text-align: right;">
                <button onclick="this.parentElement.parentElement.style.display='none'" 
                        style="border: none; background: none; cursor: pointer;">✕</button>
            </div>
            <h3>Selected Block Groups</h3>
            <p><em>${modeTitle}</em></p>
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
        view.hitTest(event).then(function(response) {
            const result = response.results.find(r =>
                r.graphic && r.graphic.layer && r.graphic.layer.id === "BeaverCounty_BG"
            );
            
            if (!result) {
                tooltip.style.display = "none";
                return;
            }

            const hoveredBGId = result.graphic.attributes.GEOID;
            let tooltipContent = `<strong>Block Group:</strong> ${hoveredBGId}`;
            
            // Check if this is a selected origin
            if (selectedOrigins.has(hoveredBGId)) {
                tooltipContent += `<br><em>Selected Origin</em>`;
                
                // Show inbound trips to this selected origin (trips ending here)
                let totalInbound = 0;
                Object.values(tripData).forEach(originData => {
                    totalInbound += originData[hoveredBGId] || 0;
                });
                
                if (totalInbound > 0) {
                    const tripType = selectedMode === "internal" ? "Internal" : "External";
                    tooltipContent += `<br><strong>Inbound ${tripType} Trips:</strong> ${totalInbound}`;
                }

                // Show total outbound trips for this origin
                const totalOutbound = Object.values(tripData[hoveredBGId] || {}).reduce((sum, trips) => sum + trips, 0);
                if (totalOutbound > 0) {
                    const tripType = selectedMode === "internal" ? "Internal" : "External";
                    tooltipContent += `<br><strong>Total Outbound ${tripType} Trips:</strong> ${totalOutbound}`;
                }
                
            } else if (selectedOrigins.size > 0) {
                // Check if this is a destination with trips
                let totalInbound = 0;
                
                Object.values(tripData).forEach(originData => {
                    totalInbound += originData[hoveredBGId] || 0;
                });

                if (totalInbound > 0) {
                    const tripType = selectedMode === "internal" ? "Internal" : "External";
                    tooltipContent += `<br><strong>Inbound ${tripType} Trips:</strong> ${totalInbound}`;
                } else {
                    tooltipContent += `<br><em>No trips to this area</em>`;
                }
            } else {
                tooltipContent += `<br><em>Click to select as origin</em>`;
            }
            
            // Position and show tooltip
            tooltip.style.left = event.x + 10 + "px";
            tooltip.style.top = event.y + 10 + "px";
            tooltip.style.display = "block";
            tooltip.innerHTML = tooltipContent;
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
