"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentUser = void 0;
const common_1 = require("@nestjs/common");
/**
 * خواندن نشست جاری در کنترلر: @CurrentUser('companyId') یا @CurrentUser() برای کل شیء
 * (فرم تک‌فیلدی ممکن است آرایه باشد — roles/permissions)
 */
exports.CurrentUser = (0, common_1.createParamDecorator)((data, ctx) => {
    const auth = ctx.switchToHttp().getRequest().auth;
    if (!auth)
        return undefined;
    return data ? auth[data] : auth;
});
