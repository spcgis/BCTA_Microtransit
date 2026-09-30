const FeatureLayer = await $arcgis.import(
  "@arcgis/core/layers/FeatureLayer.js"
);

import { baseURls, generateClassBreaks, generateRenderer, getColorFromRenderer } from "./utils.js";
    
// Initialize map
const mapElement = document.querySelector("#map");
await mapElement.componentOnReady();
const view = mapElement.view;

// Initialize state variables
let selectedOrigins = new Set();
let tripData = {};
let selectedDay = "Proposed";
let selectedTime = "Proposed";
let selectedPurpose = "Average_Daily_O_D_Traffic__StL_Volume_";
let tripPurposeLabel = "All Purposes";

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
view.ui.add(tooltip);

// Default green renderer for block groups
const greenRenderer = {
    type: "simple",
    symbol: {
        type: "simple-fill",
        color: [180, 230, 180, 0.6], // light green
        outline: { color: [0, 128, 0], width: 1 }
    }
};

const initialRenderer = {
    type: "simple",
    symbol: {
        type: "simple-fill",
        color: [180, 230, 180, 0.6], // light green
        outline: { color: [0, 128, 0], width: 1 }
    },
    label: "NA - Origin Not Selected"
};

// Layer for block group outlines (green)
const blockGroupOutlineLayer = new FeatureLayer({
    url: baseURls.boundary,
    id: "BlockGroupOutline",
    title: "Block Group Boundary",
    outFields: ["*"],
    visible: true,
    opacity: 0.7,
    renderer: greenRenderer
});

// Add both layers to the map (order matters: outlines first, trips second)
mapElement.map.add(blockGroupOutlineLayer);

// Create feature layers
const beaverCountyBG = new FeatureLayer({
    url:baseURls.boundary,
    title: "Inbound Trips",
    id: "BeaverCounty_BG",
    outFields: ["*"],
    visible: true,
    opacity: 0.7,
    renderer: initialRenderer
});

beaverCountyBG.when(() => {
    console.log("BeaverCounty layer fields:", 
        beaverCountyBG.fields.map(f => ({name: f.name, type: f.type}))
    );
});

mapElement.map.add(beaverCountyBG);

// Event handlers for filters
document.getElementById("daySelect").addEventListener("change", function(e) {
    selectedDay = e.target.value;
    // Log the selection
    console.log("Selected time period:", selectedDay === "ALL" ? "All Times" : selectedDay);
    updateLayerFilter();
});

document.getElementById("timeSelect").addEventListener("change", function(e) {
    selectedTime = e.target.value;

    // Log the selection
    console.log("Selected time period:", selectedTime === "ALL" ? "All Times" : selectedTime);       
    updateLayerFilter();
});

// Add event handler for mode selection
document.getElementById("purposeSelect").addEventListener("change", function(e) {
    selectedPurpose = e.target.value;
    tripPurposeLabel = this.options[this.selectedIndex].text;
    console.log("Selected purpose:", tripPurposeLabel);
    updateLayerFilter();
});

// Update the updateLayerFilter function to also update the legend title
function updateLayerFilter() {
    tripData = {};
    view.graphics.removeAll();
    // Re-run click logic for each already-selected origin
    selectedOrigins.forEach(bgId => handleOriginClick(bgId));
}

// Click handler
view.on("click", function(event) {
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
        handleOriginClick(clickedBGId);
    
    }).catch(error => {
        console.error("Error in hitTest:", error);
    });
});
    
function handleOriginClick(clickedBGId) {
    
    // Create a new feature layer for the query
    const queryTable = new FeatureLayer({
        url: baseURls.dataTable,
        outFields: ["*"],
        visible: false
    });

    let addDayPart;
    let addDayType;
    let averagingDay;

    // Handling for selected day
    if (selectedDay === "Proposed") {
        addDayType = `AND Day_Type IN ('1: Monday (M-M)', '2: Tuesday (Tu-Tu)', '3: Wednesday (W-W)', '4: Thursday (Th-Th)', '5: Friday (F-F)')`
        averagingDay = true;
    } else {
        addDayType =  ` AND Day_Type = '${selectedDay}'`
        averagingDay = false;
    }
    
    // Handling for selected time
    if (selectedTime === "Proposed") {
        addDayPart = `AND Day_Part NOT IN ('00: All Day (12am-12am)')`
    } else {
        addDayPart = `AND Day_Part = '${selectedTime}'`
    }
    
    // Generate query
    const whereClause = `Origin_Zone_ID = '${clickedBGId}' ${addDayType} ${addDayPart}`;
    console.log("Query for ALL times:", whereClause);
    
    queryTable.load().then(() => {
        return queryTable.queryFeatures({
            where: whereClause,
            outFields: ["Origin_Zone_ID", "Destination_Zone_ID", "Day_Type", "Day_Part", selectedPurpose],
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
        
        // Aggregate results by destination, summing across time periods AND days then divide by 5 if needed
        const aggregatedTrips = {};
        results.features.forEach(f => {
            const destId = f.attributes.Destination_Zone_ID.toString();
            const trips = parseInt(f.attributes[selectedPurpose]);
            
            aggregatedTrips[destId] = (aggregatedTrips[destId] || 0) + trips;                    
        });

        // Store aggregated results
        tripData[clickedBGId] = {};
        Object.entries(aggregatedTrips).forEach(([destId, trips]) => {
            tripData[clickedBGId][destId] = averagingDay ? Math.round(trips / 5) : trips;
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
}

// Modify the updateDisplay function
function updateDisplay() {
    view.graphics.removeAll();

    if (selectedOrigins.size === 0) {
        document.getElementById("sidePanel").style.display = "none";
        beaverCountyBG.renderer = initialRenderer;
        return;
    }

    const originIds = Array.from(selectedOrigins).map(id => `'${id}'`).join(",");
    const originQuery = beaverCountyBG.createQuery();
    originQuery.where = `GEOID IN (${originIds})`;
    originQuery.outFields = ["GEOID"];

    // Generate classbreaks dynamically        
    const sortedCounts = Object.values(tripData).flatMap(destObj => Object.values(destObj)).sort((a, b) => a - b);
    if (sortedCounts[sortedCounts.length - 1] > 200) {
        beaverCountyBG.renderer = generateRenderer(generateClassBreaks(sortedCounts));
    } else {
        beaverCountyBG.renderer = generateRenderer([5, 10, 25, 50]);
    }

    beaverCountyBG.queryFeatures(originQuery).then(function(originResults) {
        // Calculate combined trips for all destinations
        let combinedTrips = {};
        Object.values(tripData).forEach(originData => {
            Object.entries(originData).forEach(([destId, trips]) => {
                combinedTrips[destId] = (combinedTrips[destId] || 0) + trips;
            });
        });

        // Update side panel content
        updateSidePanel(originResults.features);

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
                const color = getColorFromRenderer(beaverCountyBG.renderer, tripCount);
                
                // Only add fill color, no border
                view.graphics.add({
                    geometry: f.geometry,
                    symbol: {
                        type: "simple-fill",
                        color: color,
                        outline: { color: [0, 128, 0], width: 1 } // Green border
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
function updateSidePanel(originFeatures) {
    const sidePanel = document.getElementById("sidePanel");

    let content = `
        <div style="text-align: right;">
            <button onclick="this.parentElement.parentElement.style.display='none'" 
                    style="border: none; background: none; cursor: pointer;">✕</button>
        </div>
        <h3 style="margin-block-start:0px; margin-block-end:0px;">Selected Block Groups</h3>
        <p style="margin-block-start:0px;"><em>${tripPurposeLabel} Trips</em></p>
    `;

    originFeatures.forEach(feature => {
        const bgId = feature.attributes.GEOID;
        const totalTrips = Object.values(tripData[bgId] || {}).reduce((sum, trips) => sum + trips, 0);
        
        content += `
            <div style="margin-bottom: 2px;">
                <p style="margin-block-end:0px;"><strong>Block Group:</strong> ${bgId}</p>
                <p style="margin-block-start:0px;"><strong>Total Outbound Trips:</strong> ${totalTrips}</p>
                <hr>
            </div>
        `;
    });

    sidePanel.innerHTML = content;
    sidePanel.style.display = "block";
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
                tooltipContent += `<br><strong>Inbound ${tripPurposeLabel} Trips:</strong> ${totalInbound}`;
            }

            // Show total outbound trips for this origin
            const totalOutbound = Object.values(tripData[hoveredBGId] || {}).reduce((sum, trips) => sum + trips, 0);
            if (totalOutbound > 0) {
                tooltipContent += `<br><strong>Total Outbound ${tripPurposeLabel} Trips:</strong> ${totalOutbound}`;
            }
            
        } else if (selectedOrigins.size > 0) {
            // Check if this is a destination with trips
            let totalInbound = 0;
            
            Object.values(tripData).forEach(originData => {
                totalInbound += originData[hoveredBGId] || 0;
            });

            if (totalInbound > 0) {
                tooltipContent += `<br><strong>Inbound ${tripPurposeLabel} Trips:</strong> ${totalInbound}`;
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