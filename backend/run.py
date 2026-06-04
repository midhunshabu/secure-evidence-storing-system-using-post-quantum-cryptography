"""Application entry point"""
import os
from app import create_app
APP_ENV = os.getenv('APP_ENV', os.getenv('FLASK_ENV', 'development'))
app = create_app(APP_ENV)
if __name__ == '__main__':
    debug = APP_ENV == 'development'
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('PORT', '5000')),
        debug=debug
    )
 