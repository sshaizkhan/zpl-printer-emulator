const path = require('path');

const packageJson = require('./package.json');

const {version} = packageJson;
const iconDir = path.resolve(__dirname, 'icons');

const config = {
    packagerConfig: {
        name: "ZPL Printer",
        executableName: 'zpl-printer',
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
                name: "zpl-printer",
                exe: 'zpl-printer.exe',
                iconUrl: "https://github.com/sshaizkhan/zpl-printer-emulator/tree/master",
                noMsi: true,
                setupExe: `zpl-printer-${version}-win32-${arch}-setup.exe`,
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
        },
        {
            name: "@pengx17/electron-forge-maker-appimage",
            platforms: ['linux'],
            config: {
                options: {
                    icon: path.resolve(iconDir, '512x512.png')
                }
            }
        }
    ],
    publishers: [
        {
            name: "@electron-forge/publisher-github",
            config: {
                repository: {
                    owner: "sshaizkhan",
                    name: "zpl-printer-emulator"
                },
                prerelease: false,
                draft: true
            }
        }
    ]
};

module.exports = config;