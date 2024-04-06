const MOBILE_USERAGENT = 'WhatsApp/2.23.20.10 Android/14.0.0 Device/pixel'
const g = MOBILE_USERAGENT.match(/(\d+\.\d+\.\d+\.\d+)/g)[0].split('.').map(d => +d).slice(0, -1);
console.log(g)