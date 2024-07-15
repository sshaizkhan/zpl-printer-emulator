const path = require('path');

const packageJson = require('./package.json');

const {version} = packageJson;
const iconDir = path.resolve(__dirname, 'icons');

const config = {
    packagerConfig: {
        name: "ZPL Printer Simulator",
        executableName: 'zpl-printer-simulator',
        icon: path.resolve(__dirname, 'icons', 'icon'),
    },
    makers: [
        {
            name: "@rabbitholesyndrome/electron-forge-maker-portable",
            platforms: ['win32'],
            config: {
                portable: {
                    artifactName: "${name}-portable-${version}.exe"
                }
            }
        },
        {
            name: "@electron-forge/maker-squirrel",
            platforms: ['win32'],
            config: (arch) => ({
                name: "ZPL Printer Simulator",
                exe: 'zpl-printer-simulator.exe',
                iconUrl: "https://github.com/sshaizkhan/zpl-printer-emulator/blob/master/icons/icon.ico?raw=true",
                noMsi: true,
                setupExe: `zpl-printer-simulator-${version}-win32-${arch}-setup.exe`,
                setupIcon: path.resolve(iconDir, "icon.ico"),
            })
        },
        {
            name: "@electron-forge/maker-zip",
            platforms: [
                "darwin",
                "linux"
            ]
        },
        {
            name: "@electron-forge/maker-deb",
            config: {
                icon: {
                    scalable: path.resolve(iconDir, 'icon.svg')
                }
            }
        },
        {
            name: "@electron-forge/maker-rpm",
            config: {
                icon: {
                    scalable: path.resolve(iconDir, 'icon.svg')
                }
            }
        }
    ],
    publishers: [
        {
            name: "@electron-forge/publisher-github",
            config: {
                repository: {
                    owner: "erikn69",
                    name: "ZPLPrinterSimulator"
                },
                prerelease: false,
                draft: true
            }
        }
    ]
};

module.exports = config;