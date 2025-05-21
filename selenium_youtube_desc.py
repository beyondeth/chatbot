import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import time

url = sys.argv[1]

options = Options()
options.add_argument('--headless')
options.add_argument('--no-sandbox')
options.add_argument('--disable-dev-shm-usage')

service = Service(ChromeDriverManager().install())
driver = webdriver.Chrome(service=service, options=options)
driver.get(url)
time.sleep(5)  # 페이지 로딩 대기

try:
    desc = driver.find_element("css selector", "#description").text
    print(desc)
except Exception as e:
    print("설명 추출 실패:", e)
finally:
    driver.quit() 