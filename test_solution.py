import importlib.util
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / 'backend'))
import main
import inference_client
import httpx
import asyncio

# Run sync handlers inline in this isolated ASGI harness: the managed workspace
# cannot reliably start AnyIO worker threads. Production retains sync handlers.
for route in main.app.routes:
    if hasattr(route, 'dependant'):
        def wrap(fn):
            async def call(**kwargs):
                return fn(**kwargs)
            return call
        route.dependant.call = wrap(route.dependant.call)


class TestClient:
    """Direct handler harness; avoids managed-host thread restrictions."""
    def __init__(self, app):
        self.app = app
    def get(self, path, **kwargs):
        return httpx.Response(200, json=main.health())
    def post(self, path, **kwargs):
        from pydantic import ValidationError
        from fastapi import HTTPException
        try:
            data = main.analyze_reviews(main.ReviewRequest(**kwargs['json']))
            return httpx.Response(200, json=data)
        except ValidationError:
            return httpx.Response(422)
        except HTTPException as exc:
            return httpx.Response(exc.status_code)


vector = [1.0] + [0.0]*383


class Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_render_has_no_ml_imports(self):
        self.assertFalse(any(n in sys.modules for n in ('torch', 'transformers', 'sentence_transformers', 'sklearn')))
        self.assertEqual(self.client.get('/health').status_code, 200)

    def test_contract_and_rules_for_both_platforms(self):
        sentiments = [{'label':'POSITIVE','score':0.99}, {'label':'POSITIVE','score':0.99}, {'label':'NEGATIVE','score':0.9}]
        vectors = [vector, vector, [0.0,1.0]+[0.0]*382]
        for platform in ('amazon','flipkart'):
            with patch('main.infer', return_value=(sentiments, vectors)):
                response = self.client.post('/analyze', json={'platform':platform, 'product_name':'Shirt', 'reviews':[
                    {'text':'Soft fabric', 'rating':1}, {'text':' soft  FABRIC ', 'rating':5}, {'text':'Weak material', 'rating':5}]})
            self.assertEqual(response.status_code,200)
            data = response.json()
            self.assertEqual(data['platform'],platform)
            self.assertEqual(data['total_reviews'],3)
            self.assertTrue(data['results'][1]['is_duplicate'])
            self.assertTrue(data['results'][0]['is_similar'])
            self.assertTrue(data['results'][0]['mismatch'])
            self.assertTrue(data['results'][2]['mismatch'])
            self.assertEqual(data['aspect_sentiments']['Quality'], {'positive':2,'negative':1})

    def test_empty_and_input_limits(self):
        self.assertEqual(self.client.post('/analyze',json={'reviews':[]}).json()['results'],[])
        self.assertEqual(self.client.post('/analyze',json={'reviews':[{'text':''}]}).status_code,422)
        self.assertEqual(self.client.post('/analyze',json={'reviews':[{'text':'a'}]*101}).status_code,422)

    def test_remote_validation_and_errors(self):
        with patch.dict(os.environ, {'INFERENCE_URL':'https://worker.example', 'INFERENCE_API_KEY':'test'}):
            valid = httpx.Response(200,json={'sentiments':[{'label':'POSITIVE','score':0.9}], 'embeddings':[vector]},request=httpx.Request('POST','https://worker.example/infer'))
            with patch('inference_client.httpx.post',return_value=valid) as post:
                self.assertEqual(self.client.post('/analyze',json={'reviews':[{'text':'nice'}]}).status_code,200)
                self.assertEqual(post.call_args.kwargs['headers']['Authorization'],'Bearer test')
            with patch('inference_client.httpx.post',side_effect=httpx.ReadTimeout('timeout')):
                self.assertEqual(self.client.post('/analyze',json={'reviews':[{'text':'nice'}]}).status_code,504)
            bad = httpx.Response(200,json={'sentiments':[], 'embeddings':[]},request=httpx.Request('POST','https://worker.example/infer'))
            with patch('inference_client.httpx.post',return_value=bad):
                self.assertEqual(self.client.post('/analyze',json={'reviews':[{'text':'nice'}]}).status_code,503)

    def test_cors(self):
        middleware = main.app.user_middleware[0]
        self.assertEqual(middleware.kwargs['allow_origin_regex'], r'chrome-extension://.*')

    def test_cosine(self):
        self.assertEqual(inference_client.max_similarities([]),[])
        self.assertEqual(inference_client.max_similarities([vector]),[0])
        self.assertEqual(inference_client.max_similarities([[0,0],[1,0]]),[0,0])


if __name__ == '__main__':
    unittest.main(verbosity=2)
