const loader = document.currentScript;

if (location.hostname === "jq33.design" && loader) {
  const beacon = document.createElement("script");
  beacon.defer = true;
  beacon.src = loader.dataset.beaconSrc;
  beacon.dataset.cfBeacon = loader.dataset.cfBeacon;
  document.head.append(beacon);
}
