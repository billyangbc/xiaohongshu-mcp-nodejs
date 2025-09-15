/**
 * 指纹生成器
 * 
 * @description 生成真实的浏览器指纹数据，用于反风控
 * @author MCP团队
 * @since 2024-12-20
 */

import { faker } from '@faker-js/faker';
import crypto from 'crypto';

export class FingerprintGenerator {
    constructor() {
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];

        this.webglVendors = [
            'Google Inc. (Intel)',
            'Google Inc. (NVIDIA)',
            'Google Inc. (AMD)',
            'Intel Inc.',
            'NVIDIA Corporation'
        ];

        this.webglRenderers = [
            'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)',
            'ANGLE (AMD, Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)',
            'Intel Iris OpenGL Engine',
            'NVIDIA GeForce GTX 1060 6GB/PCIe/SSE2'
        ];

        this.timezones = [
            'Asia/Shanghai',
            'Asia/Beijing',
            'Asia/Chongqing',
            'Asia/Harbin',
            'Asia/Urumqi'
        ];

        this.languages = [
            'zh-CN',
            'zh-CN,zh;q=0.9,en;q=0.8',
            'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
        ];
    }

    async generate() {
        const baseFingerprint = {
            // 基本信息
            userAgent: this._generateUserAgent(),
            viewport: this._generateViewport(),
            screen: this._generateScreen(),
            
            // 硬件信息
            deviceMemory: this._generateDeviceMemory(),
            hardwareConcurrency: this._generateHardwareConcurrency(),
            
            // 位置信息
            timezone: this._generateTimezone(),
            timezoneOffset: this._generateTimezoneOffset(),
            location: this._generateLocation(),
            
            // 语言信息
            language: this._generateLanguage(),
            languages: this._generateLanguages(),
            platform: this._generatePlatform(),
            
            // WebGL信息
            webglVendor: this._generateWebglVendor(),
            webglRenderer: this._generateWebglRenderer(),
            
            // Canvas指纹
            canvasFingerprint: this._generateCanvasFingerprint(),
            
            // Audio指纹
            audioFingerprint: this._generateAudioFingerprint(),
            
            // 字体信息
            fonts: this._generateFonts(),
            
            // 插件信息
            plugins: this._generatePlugins(),
            
            // WebRTC信息
            webrtcIP: this._generateWebRTCIP(),
            
            // 指纹ID
            fingerprintId: this._generateFingerprintId()
        };

        return baseFingerprint;
    }

    _generateUserAgent() {
        return faker.helpers.arrayElement(this.userAgents);
    }

    _generateViewport() {
        const sizes = [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1440, height: 900 },
            { width: 1536, height: 864 },
            { width: 1280, height: 720 }
        ];

        return faker.helpers.arrayElement(sizes);
    }

    _generateScreen() {
        const sizes = [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1440, height: 900 },
            { width: 1536, height: 864 },
            { width: 1280, height: 720 }
        ];

        return faker.helpers.arrayElement(sizes);
    }

    _generateDeviceMemory() {
        const memories = [4, 8, 16, 32];
        return faker.helpers.arrayElement(memories);
    }

    _generateHardwareConcurrency() {
        const cores = [2, 4, 6, 8, 12, 16];
        return faker.helpers.arrayElement(cores);
    }

    _generateTimezone() {
        return faker.helpers.arrayElement(this.timezones);
    }

    _generateTimezoneOffset() {
        // 中国时区偏移量（分钟）
        return -480;
    }

    _generateLocation() {
        // 中国主要城市坐标
        const cities = [
            { name: '北京', latitude: 39.9042, longitude: 116.4074 },
            { name: '上海', latitude: 31.2304, longitude: 121.4737 },
            { name: '广州', latitude: 23.1291, longitude: 113.2644 },
            { name: '深圳', latitude: 22.5431, longitude: 114.0579 },
            { name: '杭州', latitude: 30.2741, longitude: 120.1551 },
            { name: '成都', latitude: 30.5728, longitude: 104.0668 },
            { name: '武汉', latitude: 30.5928, longitude: 114.3055 },
            { name: '西安', latitude: 34.3416, longitude: 108.9398 },
            { name: '南京', latitude: 32.0603, longitude: 118.7969 },
            { name: '重庆', latitude: 29.4316, longitude: 106.9123 }
        ];

        return faker.helpers.arrayElement(cities);
    }

    _generateLanguage() {
        return faker.helpers.arrayElement(this.languages);
    }

    _generateLanguages() {
        return faker.helpers.arrayElement([
            ['zh-CN', 'zh', 'en'],
            ['zh-CN', 'zh', 'en-US', 'en'],
            ['zh-CN', 'zh']
        ]);
    }

    _generatePlatform() {
        const platforms = [
            'Win32',
            'MacIntel',
            'Linux x86_64'
        ];

        return faker.helpers.arrayElement(platforms);
    }

    _generateWebglVendor() {
        return faker.helpers.arrayElement(this.webglVendors);
    }

    _generateWebglRenderer() {
        return faker.helpers.arrayElement(this.webglRenderers);
    }

    _generateCanvasFingerprint() {
        // 生成Canvas指纹
        const canvas = {
            width: 220,
            height: 30,
            text: '🌟 MCP小红书指纹生成器 🌟'
        };

        const hash = crypto.createHash('md5');
        hash.update(JSON.stringify(canvas));
        return hash.digest('hex');
    }

    _generateAudioFingerprint() {
        // 生成Audio指纹
        const audioData = {
            sampleRate: 44100,
            channelCount: 2,
            bitsPerSample: 16,
            length: 1,
            data: new Array(44100).fill(0).map(() => Math.random() * 2 - 1)
        };

        const hash = crypto.createHash('md5');
        hash.update(JSON.stringify(audioData));
        return hash.digest('hex');
    }

    _generateFonts() {
        const fontFamilies = [
            'Arial',
            'Helvetica',
            'Times New Roman',
            'Times',
            'Courier New',
            'Courier',
            'Verdana',
            'Georgia',
            'Palatino',
            'Garamond',
            'Bookman',
            'Comic Sans MS',
            'Trebuchet MS',
            'Arial Black',
            'Impact',
            'SimSun',
            'NSimSun',
            'FangSong',
            'KaiTi',
            'Microsoft YaHei',
            'Microsoft JhengHei',
            'LiSu',
            'YouYuan'
        ];

        return faker.helpers.arrayElements(fontFamilies, faker.number.int({ min: 8, max: 15 }));
    }

    _generatePlugins() {
        const plugins = [
            'Chrome PDF Plugin',
            'Chrome PDF Viewer',
            'Native Client',
            'Widevine Content Decryption Module',
            'Adobe Flash Player'
        ];

        return faker.helpers.arrayElements(plugins, faker.number.int({ min: 2, max: 4 }));
    }

    _generateWebRTCIP() {
        // 生成私有IP地址
        const privateRanges = [
            '192.168.',
            '10.',
            '172.16.',
            '172.17.',
            '172.18.',
            '172.19.',
            '172.20.',
            '172.21.',
            '172.22.',
            '172.23.',
            '172.24.',
            '172.25.',
            '172.26.',
            '172.27.',
            '172.28.',
            '172.29.',
            '172.30.',
            '172.31.'
        ];

        const range = faker.helpers.arrayElement(privateRanges);
        const suffix = range.startsWith('10.') || range.startsWith('172.') 
            ? faker.number.int({ min: 0, max: 255 }) + '.' + faker.number.int({ min: 1, max: 255 })
            : faker.number.int({ min: 1, max: 255 });

        return range + suffix;
    }

    _generateFingerprintId() {
        return crypto.randomBytes(16).toString('hex');
    }

    async generateMultiple(count) {
        const fingerprints = [];
        
        for (let i = 0; i < count; i++) {
            fingerprints.push(await this.generate());
        }

        return fingerprints;
    }
}