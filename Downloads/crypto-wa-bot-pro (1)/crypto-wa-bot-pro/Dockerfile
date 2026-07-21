FROM node:20

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev

COPY . .

# Port untuk web dashboard + keep-alive (Railway/Hugging Face/VPS)
EXPOSE 7860

CMD ["node", "src/index.js"]
