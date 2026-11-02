"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequirePermissions = exports.PERMISSIONS_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.PERMISSIONS_KEY = 'required_permissions';
/**
 * مجوزهای لازم برای یک مسیر — توسط PermissionsGuard خوانده می‌شود:
 * @RequirePermissions('master.product.create')
 * نبود مجوز → 403 با قرارداد Error (کد forbidden + پیام فارسی).
 */
const RequirePermissions = (...codes) => (0, common_1.SetMetadata)(exports.PERMISSIONS_KEY, codes);
exports.RequirePermissions = RequirePermissions;
