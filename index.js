const core = require('@actions/core');
const github = require('@actions/github');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function run() {
  try {
    // 入力パラメータを取得
    const geminiApiKey = core.getInput('gemini-api-key');
    const githubToken = core.getInput('github-token');
    const pullRequestNumber = parseInt(core.getInput('pull-request-number'));
    const language = core.getInput('language') || 'en';

    // GitHub APIクライアントを初期化
    const octokit = github.getOctokit(githubToken);
    const { owner, repo } = github.context.repo;

    // プルリクエストの詳細を取得
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    // プルリクエストのファイル変更を取得
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    // プルリクエストのコミットを取得
    const { data: commits } = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    // 変更内容の要約を作成
    const changedFiles = files.map(file => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
    }));

    // コミット情報を詳細に処理
    const commitInfo = processCommits(commits);

    // Gemini APIを初期化
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash-lite-preview-06-17" });

    // プロンプトを作成
    const prompt = createPrompt(pullRequest, changedFiles, commitInfo, language);

    // Gemini APIでリリースノートを生成
    const result = await model.generateContent(prompt);
    const releaseNotes = result.response.text();

    // リリースノートをプルリクエストにコメントとして投稿
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullRequestNumber,
      body: `## 🚀 Release Notes\n\n${releaseNotes}`,
    });

    // 出力を設定
    core.setOutput('release-notes', releaseNotes);

    console.log('Release notes generated and posted successfully!');
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

function processCommits(commits) {
  // 重要なコミットを識別するキーワード
  const importantKeywords = [
    'feat', 'feature', 'add', 'implement', 'create',
    'fix', 'bug', 'patch', 'resolve', 'solve',
    'break', 'breaking', 'major', 'remove', 'delete',
    'refactor', 'improve', 'optimize', 'enhance',
    'security', 'vulnerability', 'critical',
    'release', 'version', 'bump',
    'docs', 'documentation', 'readme',
    'test', 'testing', 'spec',
    'config', 'configuration', 'setup'
  ];

  // コミット情報を詳細に処理
  const processedCommits = commits.map(commit => {
    const message = commit.commit.message;
    const author = commit.commit.author.name;
    const date = commit.commit.author.date;
    const sha = commit.sha.substring(0, 7);
    
    // 重要度を判定
    const isImportant = importantKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );

    // コミットメッセージの最初の行を取得
    const firstLine = message.split('\n')[0];
    
    return {
      sha,
      message: firstLine,
      fullMessage: message,
      author,
      date,
      isImportant
    };
  });

  // 重要なコミットを抽出
  const importantCommits = processedCommits.filter(commit => commit.isImportant);
  
  // 貢献者の統計
  const contributors = [...new Set(processedCommits.map(commit => commit.author))];
  
  // マージコミットを除外
  const meaningfulCommits = processedCommits.filter(commit => 
    !commit.message.toLowerCase().startsWith('merge')
  );

  return {
    allCommits: processedCommits,
    importantCommits,
    meaningfulCommits,
    contributors,
    totalCommits: processedCommits.length
  };
}

function createPrompt(pullRequest, changedFiles, commitInfo, language) {
  const languageInstructions = {
    en: 'Please generate release notes in English.',
    ja: 'リリースノートを日本語で生成してください。',
    es: 'Por favor, genere notas de lanzamiento en español.',
    fr: 'Veuillez générer des notes de version en français.',
    de: 'Bitte erstellen Sie Release-Notizen auf Deutsch.',
  };

  const instruction = languageInstructions[language] || languageInstructions.ja;

  return `
${instruction}

以下のプルリクエスト情報に基づいて、包括的なリリースノートをマークダウン形式で生成してください：

**重要な注意事項：**
- バージョン番号は含めないでください
- タイトルには「Release Notes」や「リリースノート」のみを使用してください
- プレースホルダーやテンプレート文字列は使用しないでください

**貢献者:**
${commitInfo.contributors.map(contributor => `- ${contributor}`).join('\n')}

**重要なコミット (${commitInfo.importantCommits.length}/${commitInfo.totalCommits}):**
${commitInfo.importantCommits.map(commit => `- ${commit.sha}: ${commit.message} (by ${commit.author})`).join('\n')}

**すべてのコミット:**
${commitInfo.meaningfulCommits.map(commit => `- ${commit.sha}: ${commit.message} (by ${commit.author})`).join('\n')}

以下の項目を含むリリースノートを作成してください：
1. 変更内容の簡潔な要約
2. 新機能（該当する場合）
3. バグ修正（該当する場合）
4. 破壊的変更（該当する場合）
5. 技術的改善（該当する場合）
6. 貢献者への謝辞

重要なコミットをメインコンテンツに重点を置き、すべてのコミットをコンテキストとして考慮してください。
適切なヘッダーと箇条書きを使用して、きれいなマークダウンとしてフォーマットしてください。プロフェッショナルでユーザーフレンドリーなものにしてください。
`;
}

run(); 