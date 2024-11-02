FROM python:3.9-slim

RUN apt update && apt upgrade
RUN apt install -y curl
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 80


CMD ["streamlit", "run", "app.py", "--server.port=80", "--server.address=0.0.0.0"]