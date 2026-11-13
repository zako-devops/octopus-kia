"""Read-only Octopus Spain device probe; authentication is the only mutation.

Run from anywhere: python3 octopus-v2c/scripts/probe_octopus.py
Reads the parent workspace's octopus.properties. Never saves credentials,
account/device identifiers, tokens, or raw responses.
"""
import base64
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ENDPOINT = 'https://api.oees-kraken.energy/v1/graphql/'
AUTH_QUERY = '''mutation ObtainKrakenToken($input: ObtainJSONWebTokenInput!) {
  obtainKrakenToken(input: $input) { token }
}'''
ACCOUNT_QUERY = 'query ProbeAccounts { viewer { accounts { number } } }'
DEVICE_QUERY = '''query ProbeDevices($account: String!) {
  devices(accountNumber: $account) {
    __typename id name deviceType
    status { current currentState isSuspended }
    preferences {
      targetType unit mode
      schedules { dayOfWeek time min max upperLimit }
    }
    preferenceSetting {
      mode unit
      scheduleSettings {
        timeFrom timeTo timeStep min max step
        minConstraint { min max }
        maxConstraint { min max }
        targetConstraint { min max }
      }
    }
    ... on SmartFlexChargePoint {
      make model vehicleBatterySize chargePointPowerOutput
      chargingPreferences {
        weekdayTargetTime weekdayTargetSoc weekendTargetTime weekendTargetSoc
        minimumSoc maximumSoc
      }
    }
  }
}'''
DISPATCH_QUERY = '''query ProbeDispatches($device: String!) {
  flexPlannedDispatches(deviceId: $device) { start end type energyAddedKwh }
}'''


class ProbeError(Exception):
    pass


def graphql(query, variables=None, token=None):
    headers = {'Content-Type': 'application/json', 'User-Agent': 'OctopusV2C-ReadOnlyProbe/1.0'}
    if token:
        headers['Authorization'] = token
    request = Request(ENDPOINT, data=json.dumps({'query': query, 'variables': variables or {}}).encode(), headers=headers)
    try:
        with urlopen(request, timeout=30) as response:
            document = json.load(response)
    except HTTPError as error:
        raise ProbeError('HTTP status ' + str(error.code)) from None
    except (URLError, TimeoutError, ValueError):
        raise ProbeError('Transport failure or invalid response; raw details suppressed') from None
    if document.get('errors'):
        # Error messages can echo input or account identifiers; report codes only.
        codes = [(e.get('extensions') or {}).get('errorCode', 'unspecified') for e in document['errors']]
        raise ProbeError('GraphQL error codes: ' + json.dumps(codes))
    return document.get('data') or {}


def local_time(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(ZoneInfo('Europe/Madrid')).isoformat()


def main():
    properties = {}
    source = Path(__file__).resolve().parents[2] / 'octopus.properties'
    for line in source.read_text().splitlines():
        text = line.strip()
        if text and not text.startswith(('#', '!')):
            key, separator, value = text.partition('=')
            if separator:
                properties[key.strip()] = value.strip()
    if not properties.get('user') or not properties.get('password'):
        raise ProbeError('octopus.properties must contain user and password')
    auth = graphql(AUTH_QUERY, {'input': {'email': properties['user'], 'password': properties['password']}})
    token = (auth.get('obtainKrakenToken') or {}).get('token')
    if not token:
        raise ProbeError('Authentication returned no token')
    result = {'checked_at_utc': datetime.now(timezone.utc).isoformat(), 'authentication': 'success'}
    try:
        claims = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '==='))
        if isinstance(claims.get('exp'), (int, float)) and isinstance(claims.get('iat'), (int, float)):
            result['token_lifetime_seconds'] = claims['exp'] - claims['iat']
    except (ValueError, IndexError):
        pass
    accounts = (graphql(ACCOUNT_QUERY, token=token).get('viewer') or {}).get('accounts') or []
    result['account_count'] = len(accounts)
    result['devices'] = []
    for account in accounts:
        devices = graphql(DEVICE_QUERY, {'account': account['number']}, token).get('devices') or []
        for device in devices:
            clean = {k: v for k, v in device.items() if k != 'id'}
            try:
                dispatches = graphql(DISPATCH_QUERY, {'device': device['id']}, token).get('flexPlannedDispatches') or []
                clean['planned_dispatches_madrid'] = [
                    {'start': local_time(d['start']), 'end': local_time(d['end']),
                     'type': d['type'], 'energy_added_kwh': d['energyAddedKwh']} for d in dispatches
                ]
            except ProbeError as error:
                clean['dispatch_query_error'] = str(error)
            result['devices'].append(clean)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except ProbeError as error:
        print('Probe failed:', error)
        raise SystemExit(1)
