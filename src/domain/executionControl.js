/** Deterministic in-memory pause/resume state for task execution. */
export class ExecutionControl {
    _status = 'RUNNING';

    pause() {
        if (this._status === 'PAUSED')
            return { status: this._status, changed: false };
        this._status = 'PAUSED';
        return { status: this._status, changed: true };
    }

    resume() {
        if (this._status === 'CANCELLED')
            return { status: this._status, changed: false };
        if (this._status === 'RUNNING')
            return { status: this._status, changed: false };
        this._status = 'RUNNING';
        return { status: this._status, changed: true };
    }

    cancel() {
        if (this._status === 'CANCELLED')
            return { status: this._status, changed: false };
        this._status = 'CANCELLED';
        return { status: this._status, changed: true };
    }

    get status() {
        return this._status;
    }
}
