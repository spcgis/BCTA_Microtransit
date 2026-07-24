require([
    "esri/Map",
    "esri/views/MapView",
    "esri/layers/FeatureLayer"
], function(Map, MapView, FeatureLayer) {
    // Initialize map with neutral basemap
    const map = new Map({
        basemap: "gray-vector"
    });

    const view = new MapView({
        container: "viewDiv",
        map: map,
        center: [-79.502, 40.517], // Mid point coordinates
        zoom: 10
    });

    // Initialize state variables
    let selectedDay = "Proposed";
    let selectedTime = "Proposed";
    let activeTrafficData = {};

    // Create filter container
    const filterDiv = document.createElement("div");
    filterDiv.id = "filterContainer";
    filterDiv.style.cssText = `
        position: absolute;
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
            <label style="font-weight: bold;">Day of Week:</label><br>
            <select id="daySelect" style="width: 100%; border: 1px solid #ccc; margin-top: 3px;">
                <option value="Proposed">Proposed Trucking Days (M-F)</option>
                <option value="0: All Days (M-Su)">All (Mon-Su)</option>
                <option value="1: Monday (M-M)">Monday</option>
                <option value="2: Tuesday (Tu-Tu)">Tuesday</option>
                <option value="3: Wednesday (W-W)">Wednesday</option>
                <option value="4: Thursday (Th-Th)">Thursday</option>
                <option value="5: Friday (F-F)">Friday</option>
                <option value="6: Saturday (Sa-Sa)">Saturday</option>
            </select>
        </div>
        <div>
            <label style="font-weight: bold;">Time Period:</label><br>
            <select id="timeSelect" style="width: 100%; border: 1px solid #ccc; margin-top: 3px;">
                <option value="Proposed">Proposed Trucking Hours (8am–5pm)</option>
                <option value="00: All Day (12am-12am)">All Day (12am-12am)</option>
                <option value="01: 8am (8am-9am)">8am-9am</option>
                <option value="02: 9am (9am-10am)">9am-10am</option>
                <option value="03: 10am (10am-11am)">10am-11am</option>
                <option value="04: 11am (11am-12pm)">11am-12pm</option>
                <option value="05: 12pm (12pm-1pm)">12pm-1pm</option>
                <option value="06: 1pm (1pm-2pm)">1pm-2pm</option>
                <option value="07: 2pm (2pm-3pm)">2pm-3pm</option>
                <option value="08: 3pm (3pm-4pm)">3pm-4pm</option>
                <option value="09: 4pm (4pm-5pm)">4pm-5pm</option>
            </select>
        </div>
    `;
    view.ui.add(filterDiv, "top-right");

    // Total AADT Summary Box
    const summaryDiv = document.createElement("div");
    summaryDiv.style.cssText = `
        position: absolute; right: 20px; top: 150px; background: white; padding: 12px;
        border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 1000;
        text-align: center; font-family: sans-serif; min-width: 150px;
    `;
    summaryDiv.innerHTML = `
        <div style="font-size: 13px; font-weight: bold; ">Average Corridor Traffic</div>
        <div id="totalVolumeText" style="font-size: 24px; font-weight: bold; color: #2e55a5; margin-top: 5px;">0</div>
        <div style="font-size: 11px; color: #666; margin-top: 2px;">vehicles</div>
    `;
    view.ui.add(summaryDiv, "top-right");

    // Segment AADT Legend
    const LegendDiv = document.createElement("div");
    LegendDiv.style.cssText = `
        position: absolute; left: 20px; bottom: 20px; background: white; width: 160px; padding: 12px;
        border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 1000;
        font-family: sans-serif; font-size: 13px; line-height: 1.5;
    `;
    LegendDiv.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px;">Average Segment Traffic (Hourly)</div>
        <div style="display: flex; align-items: center; margin-bottom: 6px;">
            <div style="width: 24px; height: 6px; background-color: rgba(189, 0, 38, 0.8); margin-right: 10px;"></div>
            <span>> 1,000</span>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 6px;">
            <div style="width: 24px; height: 4px; background-color: rgba(253, 141, 60, 0.8); margin-right: 10px;"></div>
            <span>501 - 1,000</span>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 6px;">
            <div style="width: 24px; height: 3px; background-color: rgba(254, 204, 92, 0.8); margin-right: 10px;"></div>
            <span>101 - 500</span>
        </div>
        <div style="display: flex; align-items: center;">
            <div style="width: 24px; height: 2px; background-color: rgba(255, 255, 178, 0.8); margin-right: 10px;"></div>
            <span>0 - 100</span>
        </div>
    `;
    view.ui.add(LegendDiv, "bottom-left");

    // Create feature layers
    const homerCityRoute = new FeatureLayer({
        url: "https://services3.arcgis.com/MV5wh5WkCMqlwISp/ArcGIS/rest/services/Homer_City/FeatureServer/0",
        id: "HomerCity_Route",
        outFields: ["*"]
    });
    map.add(homerCityRoute);

    const homerCityTable = new FeatureLayer({
        url: "https://services3.arcgis.com/MV5wh5WkCMqlwISp/ArcGIS/rest/services/Homer_City/FeatureServer/2",
        outFields: ["*"]
    });

    function updateTrafficData() {
        let whereClauses = [];
        
        let dayDivisor = 1;
        
        // Handling for selected day
        if (selectedDay === "Proposed") {
            whereClauses.push(`Day_Type IN ('1: Monday (M-M)', '2: Tuesday (Tu-Tu)', '3: Wednesday (W-W)', '4: Thursday (Th-Th)', '5: Friday (F-F)')`);
            dayDivisor = 5; 
        } else {
            whereClauses.push(`Day_Type = '${selectedDay}'`);
            dayDivisor = 1; 
        }

        // Finds hourly volume for coloring
        let colorHourlyDivisor = 1; 
        if (selectedTime === "Proposed") {
            whereClauses.push(`Day_Part IN ('01: 8am (8am-9am)', '02: 9am (9am-10am)', '03: 10am (10am-11am)', '04: 11am (11am-12noon)', '05: 12pm (12noon-1pm)', '06: 1pm (1pm-2pm)', '07: 2pm (2pm-3pm)', '08: 3pm (3pm-4pm)', '09: 4pm (4pm-5pm)')`);
            colorHourlyDivisor = 9;
        } else if (selectedTime === "00: All Day (12am-12am)") {
            whereClauses.push(`Day_Part = '${selectedTime}'`);
            colorHourlyDivisor = 24;
        } else {
            whereClauses.push(`Day_Part = '${selectedTime}'`);
            colorHourlyDivisor = 1; 
        }

        const tableWhere = whereClauses.join(" AND ");

        homerCityTable.queryFeatures({
            where: tableWhere,
            outFields: ["Zone_ID"],
            outStatistics: [
                {
                    statisticType: "sum",
                    onStatisticField: "Average_Daily_Segment_Traffic__StL_Volume_",
                    outStatisticFieldName: "Total_Volume"
                },
                {
                    statisticType: "sum",
                    onStatisticField: "Vehicle_Miles_of_Travel__StL_Volume_", 
                    outStatisticFieldName: "Total_VMT"
                },
                {
                    statisticType: "max",
                    onStatisticField: "Line_Zone_Length__Miles_",
                    outStatisticFieldName: "Segment_Length"
                }
            ],
            groupByFieldsForStatistics: ["Zone_ID"],
            returnGeometry: false
        }).then(function(results) {
            
            activeTrafficData = {};
            const activeZoneIds = [];
            const dynamicRendererInfos = []; 
            
            let totalVMT = 0; 
            let totalLength = 0; 

            results.features.forEach(f => {
                const zoneIdRaw = f.attributes.Zone_ID || f.attributes.Zone_Id || f.attributes.ZONEID;
    
                const volume = (f.attributes.Total_Volume || 0) / dayDivisor;
                const vmt = (f.attributes.Total_VMT || 0) / dayDivisor;
                const length = f.attributes.Segment_Length || 0;

                // Volume for mapping colors to hourly ranges
                const hourlyColorRate = volume / colorHourlyDivisor;
                
                if (zoneIdRaw !== undefined) {
                    const zoneId = String(zoneIdRaw); 
                    activeTrafficData[zoneId] = volume; 
                  
                    totalVMT += vmt;
                    totalLength += length;

                    const sqlSafeId = typeof zoneIdRaw === 'string' ? `'${zoneIdRaw}'` : zoneIdRaw;
                    activeZoneIds.push(sqlSafeId);

                    // Determine color and width based on hourlyColorRate
                    let color, width;
                    if (hourlyColorRate > 1000) {
                        color = [189, 0, 38, 0.8]; 
                        width = 6;
                    } else if (hourlyColorRate > 500) {
                        color = [253, 141, 60, 0.8]; 
                        width = 4;
                    } else if (hourlyColorRate > 100) {
                        color = [254, 204, 92, 0.8]; 
                        width = 3;
                    } else {
                        color = [255, 255, 178, 0.8]; 
                        width = 2;
                    }

                    const symbolObj = {
                        type: "simple-line",
                        color: color,
                        width: width,
                        style: "solid"
                    };

                    dynamicRendererInfos.push({
                        value: zoneIdRaw, 
                        symbol: symbolObj
                    });

                    if (typeof zoneIdRaw === "string" && !isNaN(zoneIdRaw)) {
                        dynamicRendererInfos.push({
                            value: parseInt(zoneIdRaw, 10),
                            symbol: symbolObj
                        });
                    }
                }
            });

            // Calculate length-weighted corridor average
            let weightedAverage = 0;
            if (totalLength > 0) {
                weightedAverage = totalVMT / totalLength;
            }

            // Update UI box
            document.getElementById("totalVolumeText").innerText = Math.round(weightedAverage).toLocaleString();

            // Render Route Layer
            if (activeZoneIds.length > 0) {
                homerCityRoute.definitionExpression = `Zone_ID IN (${activeZoneIds.join(",")})`;
                homerCityRoute.renderer = {
                    type: "unique-value",
                    field: "Zone_ID", 
                    defaultSymbol: {
                        type: "simple-line", color: [150, 150, 150, 0.5], width: 1
                    },
                    uniqueValueInfos: dynamicRendererInfos
                };
            } else {
                homerCityRoute.definitionExpression = "1=2"; 
                document.getElementById("totalVolumeText").innerText = "0";
            }
        }).catch(err => console.error("Error grouping traffic data:", err));
    }

    // Event Listeners
    document.getElementById("daySelect").addEventListener("change", function(e) {
        selectedDay = e.target.value;
        updateTrafficData();
    });

    document.getElementById("timeSelect").addEventListener("change", function(e) {
        selectedTime = e.target.value;
        updateTrafficData();
    });

    // Initial Load
    updateTrafficData();
});