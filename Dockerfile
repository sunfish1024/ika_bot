FROM node:20.13.1

# コンテナ内の作業ディレクトリを設定
WORKDIR app

# package.jsonとpackage-lock.json（存在する場合）をコピー
COPY package.json .

# 依存関係をインストール
RUN npm install

# プロジェクトの全ファイルをコピー
COPY . .

# コンテナ起動時にbot.jsを実行
CMD [node, bot.js]
