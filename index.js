const core = require('@actions/core');
const github = require('@actions/github');
const { GoogleGenAI } = require('@google/genai');

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
    const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
    const model = genAI.models;

    // プロンプトを作成
    const prompt = createPrompt(pullRequest, changedFiles, commitInfo, language);

    // Gemini APIでリリースノートを生成
    const result = await model.generateContent({
      model: 'gemini-2.0-flash-001',
      contents: prompt,
    });
    const releaseNotes = result.text;

    // トークン使用量をログに記録
    const usageMetadata = result.usageMetadata;
    if (usageMetadata) {
      console.log('=== Token Usage Information ===');
      console.log(`Prompt tokens: ${usageMetadata.promptTokenCount || 'N/A'}`);
      console.log(`Completion tokens: ${usageMetadata.candidatesTokenCount || 'N/A'}`);
      console.log(`Total tokens: ${usageMetadata.totalTokenCount || 'N/A'}`);
      console.log('===============================');
    } else {
      console.log('Token usage information not available');
    }

    // PRの説明欄を更新（既存のリリースノートがあれば置換、なければ追記）
    const currentBody = pullRequest.body || '';
    const releaseNotesSection = `\n\n---\n\n## 🚀 Release Notes\n\n${releaseNotes}`;
    
    // 既存のリリースノートセクションを検索
    const releaseNotesRegex = /\n\n---\n\n## 🚀 Release Notes\n\n[\s\S]*$/;
    
    let newBody;
    if (releaseNotesRegex.test(currentBody)) {
      // 既存のリリースノートセクションを置換
      newBody = currentBody.replace(releaseNotesRegex, releaseNotesSection);
    } else {
      // 新しいリリースノートセクションを追記
      newBody = currentBody + releaseNotesSection;
    }

    // PRの説明欄を更新
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullRequestNumber,
      body: newBody,
    });

    // 出力を設定
    core.setOutput('release-notes', releaseNotes);

    console.log('Release notes generated and updated in PR description successfully!');
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

以下のプルリクエスト情報に基づいて、具体的なリリースノートをマークダウン形式で生成してください：

**厳守事項：**
- バージョン番号、バージョン表記、[バージョン番号を挿入]などは一切含めないでください
- 「このリリースでは」「ユーザー体験の大幅な向上」などの抽象的な表現は使用しないでください
- プレースホルダーやテンプレート文字列は絶対に使用しないでください
- 具体的な変更内容のみを記述してください

**貢献者:**
${commitInfo.contributors.map(contributor => `- ${contributor}`).join('\n')}

**重要なコミット (${commitInfo.importantCommits.length}/${commitInfo.totalCommits}):**
${commitInfo.importantCommits.map(commit => `- ${commit.sha}: ${commit.message} (by ${commit.author})`).join('\n')}

**すべてのコミット:**
${commitInfo.meaningfulCommits.map(commit => `- ${commit.sha}: ${commit.message} (by ${commit.author})`).join('\n')}

上記のコミット情報を基に、以下の構成でリリースノートを作成してください：

## 要約
（変更を元にプルリクエストの概要を記述）

## 新機能
（該当するコミットがある場合のみ、具体的な機能を記述）

## バグ修正
（該当するコミットがある場合のみ、修正内容を記述）

## 改善
（該当するコミットがある場合のみ、改善内容を記述）

## 破壊的変更
（該当するコミットがある場合のみ、変更内容を記述）

## 貢献者
（貢献者一覧）

抽象的な表現は避け、コミットメッセージから読み取れる具体的な変更内容のみを記述してください。
`;
}

run(); 