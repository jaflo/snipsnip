import json
import os
import boto3
import botocore
import string
import random
import traceback
import hashlib
import time

os.environ["PATH"] += ":"+os.path.dirname(os.path.abspath(__file__))+"/bin"

from main import process, crossfade

s3 = boto3.client("s3")
bucket = os.environ["BUCKET"]
expiration = 60*60 # one hour

def random_key():
    return "".join(random.choice(string.ascii_letters) for m in range(32))

def params(event):
    return json.loads(event["body"])

def upload_url(event, context):
    try:
        key = random_key()

        url = s3.generate_presigned_url(
            ClientMethod = "put_object",
            Params = {
                "Bucket": bucket,
                "Key": key,
                "ContentType": params(event)["type"],
                "Expires": expiration
            }
        )

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials": True
            },
            "body": json.dumps({
                "success": True,
                "message": "Ready for upload.",
                "key": key,
                "url": url
            })
        }
    except Exception as e:
        print("Unexpected error:")
        traceback.print_exc()

        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials": True
            },
            "body": json.dumps({
                "success": False,
                "message": "Encountered error. {0}".format(e)
            })
        }

def wait_and_download(key, target):
    for _ in range(0, 10):
        try:
            s3.download_file(bucket, key, target)
        except botocore.exceptions.ClientError as e:
            if e.response["Error"]["Code"] in ["404", "403"]:
                time.sleep(0.3)
                continue # and retry
        break

def analyze(event, context):
    p = params(event)
    try:
        fname = "/tmp/"+p["key"]+".mp3"
        wait_and_download(p["key"], fname)
        sha256 = hashlib.sha256(open(fname, "rb").read()).hexdigest()

        try:
            s3.download_file(bucket, sha256+".json", fname+".json")
        except botocore.exceptions.ClientError as e:
            if e.response["Error"]["Code"] == "404":
                body = process(fname, 200)
                if len(body["results"]) > 40:
                    with open(fname+".json", "w") as f:
                        json.dump(body, f)
                    s3.upload_file(fname+".json", bucket, sha256+".json")
            else:
                raise
        else:
            with open(fname+".json") as f:
                body = json.loads(f.read())

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials": True
            },
            "body": json.dumps({
                "success": True,
                "message": "Processed file.",
                "data": body
            }, separators=(",", ":"))
        }
    except Exception as e:
        print("Unexpected error:", p["key"])
        traceback.print_exc()

        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials": True
            },
            "body": json.dumps({
                "success": False,
                "message": "Encountered error on server. {0}".format(e)
            })
        }

def export(event, context):
    p = params(event)
    try:
        key = random_key()
        nodip = "nodip" in p and p["nodip"]
        fname = "/tmp/"+p["key"]+".mp3"

        wait_and_download(p["key"], fname)
        crossfade(fname, "/tmp/output.mp3", p["overlap"], p["a"], p["b"], nodip)
        s3.upload_file("/tmp/output.mp3", bucket, key)
        sha256 = hashlib.sha256(open(fname, "rb").read()).hexdigest()

        url = s3.generate_presigned_url(
            ClientMethod = "get_object",
            Params = {
                "Bucket": bucket,
                "Key": key,
                "ResponseContentDisposition": "attachment; filename=kurz.app-"+sha256[:6]+".mp3",
                "ResponseContentType" : "audio/mpeg"
            }
        )

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials": True
            },
            "body": json.dumps({
                "success": True,
                "message": "Exported file.",
                "key": key,
                "url": url,
                "nodip": nodip
            })
        }
    except Exception as e:
        print("Unexpected error:", p["key"])
        traceback.print_exc()

        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials": True
            },
            "body": json.dumps({
                "success": False,
                "message": "Encountered error on server. {0}".format(e)
            })
        }
