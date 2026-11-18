const { execFileSync } = require('node:child_process');
const path = require('node:path');

// macOS (Apple Silicon) start geen app zonder handtekening; zonder Apple-account ondertekenen we ad hoc.
exports.default = async (context) => {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
