export const baseURls = {
    //Block group boundary
    boundary: "https://services3.arcgis.com/MV5wh5WkCMqlwISp/ArcGIS/rest/services/BCTA_Trip_Purpose/FeatureServer/0",
    // Data table with streetlight volume
    dataTable: "https://services3.arcgis.com/MV5wh5WkCMqlwISp/ArcGIS/rest/services/BCTA_Trip_Purpose/FeatureServer/1"
}

export function generateRenderer(breaks) {
    return {
        type: "class-breaks",
        defaultSymbol: {
            type: "simple-fill",
            color: [180, 230, 180, 0.6], // green for no trips
            outline: { color: [0, 128, 0], width: 1 }
        },
        defaultLabel: "0 trip",
        classBreakInfos: [
        {
            minValue: 1,
            maxValue: breaks[0],
            symbol: {
                type: "simple-fill",
                color: [255, 241, 169, 0.7],
                outline: { color: [0, 128, 0], width: 1 }
            },
            label: `1-${breaks[0]} trips`
        },
        {
            minValue: breaks[0]+1,
            maxValue: breaks[1],
            symbol: {
                type: "simple-fill",
                color: [254, 204, 92, 0.7],
                outline: { color: [0, 128, 0], width: 1 }
            },
            label: `${breaks[0]+1}-${breaks[1]} trips`
        },
        {
            minValue: breaks[1]+1,
            maxValue: breaks[2],
            symbol: {
                type: "simple-fill",
                color: [253, 141, 60, 0.7],
                outline: { color: [0, 128, 0], width: 1 }
            },
            label: `${breaks[1]+1}-${breaks[2]} trips`
        },
        {
            minValue: breaks[2]+1,
            maxValue: breaks[3],
            symbol: {
                type: "simple-fill",
                color: [240, 59, 32, 0.7],
                outline: { color: [0, 128, 0], width: 1 }
            },
            label: `${breaks[2]+1}-${breaks[3]} trips`
        },
        {
            minValue: breaks[3]+1,
            maxValue: 99999999999,
            symbol: {
                type: "simple-fill",
                color: [189, 0, 38, 0.7],
                outline: { color: [0, 128, 0], width: 1 }
            },
            label: `>${breaks[3]} trips`
        }
    ]};
}

// Dynamically generate classbreaks
export function generateClassBreaks(data, numClasses = 5) {
    if (!data || data.length === 0) return [5, 10, 25, 50];
    const n = data.length;

    // Initialize matrices
    const mat1 = Array.from({ length: n + 1 }, () => Array(numClasses + 1).fill(0));
    const mat2 = Array.from({ length: n + 1 }, () => Array(numClasses + 1).fill(0));

    for (let i = 1; i <= numClasses; i++) {
        mat1[0][i] = 1;
        mat2[0][i] = 0;
        for (let j = 1; j <= n; j++) {
            mat2[j][i] = Infinity;
        }
    }

    let v = 0;
    for (let l = 2; l <= n; l++) {
        let s1 = 0, s2 = 0, w = 0;
        for (let m = 1; m <= l; m++) {
            const i3 = l - m + 1;
            const val = data[i3 - 1];

            s2 += val * val;
            s1 += val;
            w++;

            v = s2 - (s1 * s1) / w;
            const i4 = i3 - 1;
            if (i4 !== 0) {
                for (let j = 2; j <= numClasses; j++) {
                    if (mat2[l][j] >= (v + mat2[i4][j - 1])) {
                        mat1[l][j] = i3;
                        mat2[l][j] = v + mat2[i4][j - 1];
                    }
                }
            }
        }
        mat1[l][1] = 1;
        mat2[l][1] = v;
    }

    // Backtrack to find class breaks
    const breaks = Array(numClasses + 1).fill(0);
    breaks[numClasses] = data[data.length - 1];
    let k = n;
    for (let j = numClasses; j >= 2; j--) {
        const id = mat1[k][j] - 2;
        breaks[j - 1] = data[id];
        k = mat1[k][j] - 1;
    }
    breaks[0] = data[0];
    let roundedBreaks = breaks.map(b => Math.round(b / 5) * 5);

    return roundedBreaks.slice(1);
}

// Get the appropriate 
export function getColorFromRenderer(renderer, tripCount) {
    const breakInfo = renderer.classBreakInfos.find(info => 
        tripCount >= info.minValue && tripCount <= info.maxValue
    );
    return breakInfo ? breakInfo.symbol.color : [0, 0, 0, 0];
}