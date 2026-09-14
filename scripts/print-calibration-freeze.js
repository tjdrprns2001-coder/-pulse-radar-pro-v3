const {buildFreezeManifest}=require('../lib/calibration-freeze.js');
const out=buildFreezeManifest();
process.stdout.write(JSON.stringify({sha256:out.sha256,canonicalBytes:out.canonicalBytes,manifest:out.manifest},null,2)+'\n');
