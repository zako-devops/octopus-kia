"""Read-only unless --send is specified. Cancel one active manual boost.

Does not suspend smart control or change charging preferences. No mutation retry.
Credentials, tokens and device/account IDs remain in memory.
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from probe_octopus import graphql, AUTH_QUERY, ACCOUNT_QUERY

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local'
RECEIPT = LOCAL / 'boost-trial-stop.json'
QUERY = '''query($account:String!){devices(accountNumber:$account){id status{current currentState isSuspended}
 preferences{targetType mode unit schedules{dayOfWeek time min max}}
 capabilities{__typename ...on FlexCancelBoostChargeCapability{capabilitySupport{supportType}}}
 ...on SmartFlexChargePoint{make model}}}'''
CANCEL = '''mutation($input:UpdateBoostChargeInput){updateBoostCharge(input:$input){id}}'''


def main():
    LOCAL.mkdir(exist_ok=True)
    send = sys.argv[1:] == ['--send']
    assert not sys.argv[1:] or send, 'Unsupported arguments'
    receipt = {'checked_at_utc': datetime.now(timezone.utc).isoformat(), 'authorized_stop': send, 'write_requests': 0}
    props = {}
    for line in (ROOT.parent / 'octopus.properties').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith(('#', '!')):
            key, value = line.split('=', 1)
            props[key.strip()] = value.strip()
    token = graphql(AUTH_QUERY, {'input': {'email': props['user'], 'password': props['password']}})['obtainKrakenToken']['token']
    accounts = graphql(ACCOUNT_QUERY, token=token)['viewer']['accounts']
    assert len(accounts) == 1, 'Ambiguous account'
    account = accounts[0]['number']

    def read():
        devices = graphql(QUERY, {'account': account}, token)['devices']
        devices = [d for d in devices if d.get('make') == 'V2C' and 'Trydan' in d.get('model', '')]
        assert len(devices) == 1, 'Ambiguous charger'
        return devices[0]

    device = read()
    original = device['preferences']
    receipt['before'] = device['status']
    supported = any(c['__typename'] == 'FlexCancelBoostChargeCapability' and c.get('capabilitySupport', {}).get('supportType') == 'FLEX_SERVICE' for c in device['capabilities'] or [])
    receipt['cancel_supported'] = supported
    if send:
        if RECEIPT.exists():
            previous = json.loads(RECEIPT.read_text())
            assert not previous.get('write_requests'), 'Previous stop command exists; verify it before another trial'
        assert device['status']['current'] == 'LIVE' and device['status']['currentState'] == 'BOOSTING' and supported, 'No supported active boost to cancel'
        receipt.update(write_requests=1, outcome='pending')
        RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n')
        try:
            graphql(CANCEL, {'input': {'deviceId': device['id'], 'action': 'CANCEL'}}, token)
            receipt['acknowledged'] = True
        except Exception:
            receipt['acknowledged'] = False
        # Re-read only. An uncertain mutation is never retried.
        for attempt in range(4):
            try:
                current = read()
                assert current['id'] == device['id'], 'Charger identity changed'
                receipt['after'] = current['status']
                receipt['preferences_unchanged'] = current['preferences'] == original
                if current['status']['currentState'] in ('SMART_CONTROL_CAPABLE', 'SMART_CONTROL_IN_PROGRESS'):
                    receipt['outcome'] = 'boost_cancelled_smart_control_restored'
                    break
            except Exception:
                receipt['read_back_failed'] = True
            if attempt < 3:
                time.sleep(2)
        if receipt['outcome'] == 'pending':
            receipt['outcome'] = 'uncertain_no_retry'
        receipt['finished_at_utc'] = datetime.now(timezone.utc).isoformat()
        RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Stop trial blocked or failed; details suppressed. Check the sanitized receipt before retrying.')
        raise SystemExit(1)
