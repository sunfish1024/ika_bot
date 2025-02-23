FROM node:20.13.1

# コンテナ内の作業ディレクトリを設定（絶対パス推奨）
WORKDIR /app

# package.jsonをコピー
COPY package.json . 

# 依存関係をインストール
RUN npm install

# プロジェクトの全ファイルをコピー
COPY . .

# コンテナ起動時にbot.jsを実行（文字列として指定）
CMD ["node", "bot.js"]
