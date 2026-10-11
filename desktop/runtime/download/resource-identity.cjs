'use strict';
/** Keep content selectors; omit only common expiring authentication fields. */
module.exports = function resourceIdentity(value, base) {
    const url = new URL(value, base);
    for (const key of [...url.searchParams.keys()]) {
        if (/^(token|expires|expiry|signature|sig|auth|authorization|policy|key-pair-id|hdnts|hdnea|x-amz-.+)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
};
