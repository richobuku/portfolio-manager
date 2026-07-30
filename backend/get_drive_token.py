"""
One-time script: get a Google Drive OAuth2 refresh token.

Run ONCE locally:
    python get_drive_token.py

It opens your browser for Google sign-in, then prints three values
to add as Render environment variables:
  GOOGLE_OAUTH2_CLIENT_ID
  GOOGLE_OAUTH2_CLIENT_SECRET
  GOOGLE_OAUTH2_REFRESH_TOKEN
"""

import json
import sys
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ['https://www.googleapis.com/auth/drive']
CLIENT_FILE = 'oauth_client.json'

def main():
    try:
        flow = InstalledAppFlow.from_client_secrets_file(CLIENT_FILE, SCOPES)
    except FileNotFoundError:
        print(f'\nERROR: {CLIENT_FILE} not found.')
        print('Download your OAuth client JSON from GCP Console and save it as backend/oauth_client.json\n')
        sys.exit(1)

    print('\nOpening browser for Google sign-in...')
    creds = flow.run_local_server(port=0)

    with open(CLIENT_FILE) as f:
        client_data = json.load(f)

    client_info = client_data.get('installed') or client_data.get('web', {})
    client_id     = client_info.get('client_id', '')
    client_secret = client_info.get('client_secret', '')

    print('\n' + '=' * 60)
    print('Add these three variables to Render → Environment:')
    print('=' * 60)
    print(f'\nGOOGLE_OAUTH2_CLIENT_ID\n{client_id}')
    print(f'\nGOOGLE_OAUTH2_CLIENT_SECRET\n{client_secret}')
    print(f'\nGOOGLE_OAUTH2_REFRESH_TOKEN\n{creds.refresh_token}')
    print('\n' + '=' * 60)

if __name__ == '__main__':
    main()
