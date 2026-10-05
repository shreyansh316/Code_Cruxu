/** Return whether a path uses a Win32 trailing-name or reserved-device alias. */
export function hasWindowsPathAlias(path) {
    return path.split(/[\\/]/).some((segment) => {
        if (segment === '.' || segment === '..') return false;
        const normalized = segment.replace(/[. ]+$/g, '');
        const deviceName = normalized.split('.')[0].toUpperCase();
        return segment.endsWith('.') || segment.endsWith(' ')
            || /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])$/.test(deviceName);
    });
}
