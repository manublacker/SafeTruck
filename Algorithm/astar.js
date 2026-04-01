// "use strict";
// function haversine(lat1, lon1, lat2, lon2) {
//     const toRadians = (degrees) => degrees * Math.PI / 180;
//     lat1 = toRadians(lat1);
//     lon1 = toRadians(lon1);
//     lat2 = toRadians(lat2);
//     lon2 = toRadians(lon2);
//     const difLat = lat2 - lat1;
//     const difLon = lon2 - lon1;
//     const R = 6371000;
//     const a = Math.sin(difLat / 2) ** 2 +
//         Math.cos(lat1) * Math.cos(lat2) * Math.sin(difLon / 2) ** 2;
//     const distance = 2 * R * Math.asin(Math.sqrt(a));
//     return distance;
// }
// function route(prev, origin, destination) {
//     const path = [];
//     path.push(destination);
//     let currentPrev = prev[destination];
//     while (currentPrev !== origin) {
//         path.push(currentPrev);
//         currentPrev = prev[currentPrev];
//     }
//     path.push(origin);
//     path.reverse();
//     return path;
// }
