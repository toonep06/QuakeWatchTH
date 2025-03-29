// script.js
let userLocation = null;
let testMarker = null;
let testActive = false;
let heatLayer = null;
const cities = [
    { name: "กรุงเทพฯ", lat: 13.7563, lon: 100.5018 },
    { name: "เชียงใหม่", lat: 18.7961, lon: 98.9793 },
    { name: "ขอนแก่น", lat: 16.4419, lon: 102.8350 },
    { name: "ภูเก็ต", lat: 7.8804, lon: 98.3923 },
    { name: "หาดใหญ่", lat: 7.0084, lon: 100.4747 }
];
let userInteracted = false;

document.body.addEventListener('click', () => {
    userInteracted = true;
});


const map = L.map('map').setView([15, 100], 5);

L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap (France)'
}).addTo(map);

// ไฮไลต์ประเทศไทย
fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
    .then(res => res.json())
    .then(data => {
        const thailand = data.features.find(f => f.properties.ADMIN === "Thailand");
        if (thailand) {
            L.geoJSON(thailand, {
                style: {
                    color: "#00FFAA",
                    weight: 2,
                    fillOpacity: 0.05
                }
            }).addTo(map);
        }
    });

// อ่าน GPS ผู้ใช้
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude } = pos.coords;
        userLocation = { lat: latitude, lon: longitude };
        L.marker([latitude, longitude]).addTo(map).bindPopup("📍 ตำแหน่งของคุณ").openPopup();
    });
}

const list = document.getElementById('distances');
const updatedDisplay = document.getElementById('last-updated');
const audio = document.getElementById('alert-sound');
const infoPanel = document.getElementById('info');
const toggleBtn = document.getElementById('toggle-info');
const testBtn = document.getElementById('test-alert');
const chartCanvas = document.getElementById('quakeChart');
let quakeChart;

let markers = [];

// ปุ่ม toggle ข้อมูล
toggleBtn.onclick = () => {
    infoPanel.classList.toggle('hidden');
    toggleBtn.textContent = infoPanel.classList.contains('hidden') ? 'แสดงข้อมูล' : 'ซ่อนข้อมูล';
};

// ปุ่มทดสอบ
testBtn.addEventListener('click', () => {
    if (!testActive) {
        const lat = 15.5, lon = 100.5, mag = 6.2, depth = 10;
        const timeStr = new Date().toLocaleString('th-TH');
        const place = '📍 ทดสอบแผ่นดินไหวใกล้กรุงเทพฯ';
        testMarker = L.circleMarker([lat, lon], {
            radius: 8,
            fillColor: 'red',
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map).bindPopup(`<b>${place}</b><br>ขนาด: ${mag}<br>เวลา: ${timeStr}<br>ความลึก: ${depth} กม.`).openPopup();
        map.setView([lat, lon], 6);
        audio.play();
        document.getElementById("map").classList.add("shake");
        setTimeout(() => document.getElementById("map").classList.remove("shake"), 500);
        testBtn.textContent = 'ยกเลิกการทดสอบ';
        testActive = true;
    } else {
        if (testMarker) map.removeLayer(testMarker);
        testBtn.textContent = 'ทดสอบแจ้งเตือน';
        testActive = false;
    }
});

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// รวม fetchEarthquakes + updateFeedText
async function fetchEarthquakes() {
    const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson';
    const res = await fetch(url);
    const data = await res.json();
    list.innerHTML = '';
    markers.forEach(m => map.removeLayer(m));
    if (heatLayer) map.removeLayer(heatLayer);
    markers = [];

    const now = new Date();
    const daysBack = 3;
    const recent = [], heatData = [], chartMap = {};

    const filtered = data.features.filter(f => {
        const time = new Date(f.properties.time);
        const diff = (now - time) / (1000 * 60 * 60 * 24);
        const place = f.properties.place.toLowerCase();
        const isThaiOrMyanmar = place.includes("myanmar") || place.includes("พม่า") || place.includes("thailand") || place.includes("ไทย");
        return diff <= daysBack && f.properties.mag >= 4.0 && isThaiOrMyanmar;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<li>ไม่มีแผ่นดินไหวรุนแรงในช่วง 3 วันที่ผ่านมา</li>';
        updatedDisplay.textContent = 'อัปเดตล่าสุด: -';
        return;
    }

    const fetchedAt = new Date().toLocaleString('th-TH');
    updatedDisplay.textContent = `อัปเดตล่าสุด: ${fetchedAt}`;

    const messages = [];
    let countMyanmar = 0;

    filtered.forEach(f => {
        const [lon, lat, depth] = f.geometry.coordinates;
        const { place, mag } = f.properties;
        const time = new Date(f.properties.time);
        const timeStr = time.toLocaleString('th-TH');
        const color = mag >= 5.0 ? 'red' : 'blue';

        const marker = L.circleMarker([lat, lon], {
            radius: 8,
            fillColor: color,
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map).bindPopup(`<b>📍 ${place}</b><br>ขนาด: ${mag}<br>เวลา: ${timeStr}<br>ความลึก: ${depth} กม.`);

        markers.push(marker);
        heatData.push([lat, lon, mag]);

        const isNearCity = cities.some(city => haversine(lat, lon, city.lat, city.lon) <= 1000);
        const isNearUser = userLocation && haversine(lat, lon, userLocation.lat, userLocation.lon) <= 300;

        const quakeAgeInSeconds = (now - time) / 1000;

        if (mag >= 5.0 && quakeAgeInSeconds <= 120) {
            if (Notification.permission === 'granted') {
                new Notification(`📢 แผ่นดินไหว ${mag} ใกล้คุณ!`);
            }
            audio.play();
            document.getElementById("map").classList.add("shake");
            console.log("เสียงทำงาน");
            setTimeout(() => document.getElementById("map").classList.remove("shake"), 500);
        }

        const quakeInfo = document.createElement('li');
        quakeInfo.innerHTML = `<b>📍 ${place}</b><br>ขนาด: ${mag}, เวลา: ${timeStr}<br>📏 ความลึก: ${depth} กม.`;

        const cityDistances = cities.map(city => {
            const dist = haversine(lat, lon, city.lat, city.lon).toFixed(1);
            return `${city.name} (${dist} กม.)`;
        });
        if (userLocation) {
            const userDist = haversine(lat, lon, userLocation.lat, userLocation.lon).toFixed(1);
            cityDistances.unshift(`คุณ (${userDist} กม.)`);
        }

        quakeInfo.innerHTML += `<br>🛫 ระยะจากเมืองหลัก: ${cityDistances.join(' | ')}`;
        list.appendChild(quakeInfo);

        const dayKey = time.toISOString().slice(0, 10);
        chartMap[dayKey] = (chartMap[dayKey] || 0) + 1;

        messages.push(`📢 ขนาด ${mag} - ${place} (${timeStr})`);
        if (place.toLowerCase().includes("myanmar") || place.toLowerCase().includes("พม่า")) {
            countMyanmar++;
        }
    });

    heatLayer = L.heatLayer(heatData, { radius: 25, blur: 15 }).addTo(map);

    document.getElementById("quake-stats").innerHTML = ` | <img src="https://flagcdn.com/w20/mm.png" alt="Myanmar Flag" style="vertical-align: middle; height: 14px;"> แผ่นดินไหวในพม่า ${countMyanmar} ครั้ง`;

    const feedElem = document.getElementById('quake-feed-text');
    const latest = messages.sort((a, b) => {
        const aTime = new Date(a.match(/\((.*?)\)/)[1]);
        const bTime = new Date(b.match(/\((.*?)\)/)[1]);
        return bTime - aTime;
    })[0];
    feedElem.textContent = latest;
}


if (Notification.permission !== 'granted') {
    Notification.requestPermission();
}

fetchEarthquakes();
setInterval(fetchEarthquakes, 6000);
