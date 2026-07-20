import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TextInput,
  StatusBar,
  Dimensions,
  Platform,
  Image
} from 'react-native';
import { generateQuizFromPDF } from './src/services/api';
import {
  saveQuizToDatabase,
  getQuizHistoryFromDatabase,
  saveUserProfileToDatabase,
  getUserProfileFromDatabase,
  loginUser,
  signUpUser,
  logoutUser,
  subscribeToAuthChanges
} from './src/services/firebase';

const { width } = Dimensions.get('window');

export default function App() {
  // Navigation State
  const [currentScreen, setCurrentScreen] = useState('login'); // 'login' | 'home' | 'upload' | 'quiz' | 'score' | 'history' | 'profile'

  // User Auth State
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // User Profile State
  const [userProfile, setUserProfile] = useState({
    name: 'Aspirant',
    phone: '',
    examPreparingFor: 'UPSC Civil Services',
    studyGoal: 'Master Syllabus & Score 85%+',
    dailyTarget: '2 Quizzes / Day',
    avatarEmoji: '🎓'
  });

  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // App Quiz Config & Data State
  const [selectedFile, setSelectedFile] = useState(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [timerMinutes, setTimerMinutes] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');

  // Loading & Quiz state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [currentQuiz, setCurrentQuiz] = useState(null);

  // User Quiz Progress state
  const [userAnswers, setUserAnswers] = useState({});
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(600);
  const [quizResults, setQuizResults] = useState(null);

  // History state
  const [quizHistoryList, setQuizHistoryList] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Timer interval ref
  const timerRef = React.useRef(null);

  // Subscribe to Firebase Auth changes & load profile
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(async (user) => {
      if (user) {
        setCurrentUser(user);
        const savedProfile = await getUserProfileFromDatabase(user.uid);
        if (savedProfile) {
          setUserProfile(prev => ({ ...prev, ...savedProfile }));
        }
        if (currentScreen === 'login') {
          setCurrentScreen('home');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Load Quiz History
  const loadHistory = async () => {
    setIsLoadingHistory(true);
    const history = await getQuizHistoryFromDatabase();
    setQuizHistoryList(history);
    setIsLoadingHistory(false);
  };

  useEffect(() => {
    loadHistory();
  }, [currentScreen]);

  // Derived Performance Analytics
  const totalTestsTaken = quizHistoryList.length;
  const averageScorePercentage = totalTestsTaken > 0
    ? Math.round(quizHistoryList.reduce((acc, item) => acc + (item.scorePercentage || 0), 0) / totalTestsTaken)
    : 0;
  const totalQsAttempted = quizHistoryList.reduce((acc, item) => acc + (item.totalQuestions || 5), 0);
  const totalCorrectQs = quizHistoryList.reduce((acc, item) => acc + (item.correctCount || 0), 0);

  // Auth Handlers
  const handleAuthAction = async () => {
    setAuthError('');

    if (!emailInput || !passwordInput) {
      setAuthError('Please enter both Email and Password.');
      return;
    }

    if (passwordInput.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    setIsAuthLoading(true);

    try {
      let user;
      if (authMode === 'login') {
        user = await loginUser(emailInput, passwordInput);
      } else {
        user = await signUpUser(emailInput, passwordInput);
      }

      setCurrentUser(user);
      const savedProfile = await getUserProfileFromDatabase(user.uid);
      if (savedProfile) {
        setUserProfile(prev => ({ ...prev, ...savedProfile }));
      }
      setIsAuthLoading(false);
      setCurrentScreen('home');
    } catch (err) {
      setIsAuthLoading(false);
      setAuthError(err.message.replace('Firebase:', '').trim());
    }
  };

  const handleGuestLogin = () => {
    setCurrentUser({
      email: 'student@examprep.com',
      isGuest: true
    });
    setCurrentScreen('home');
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setCurrentScreen('login');
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    await saveUserProfileToDatabase(currentUser?.uid, userProfile);
    setIsSavingProfile(false);
    Alert.alert('Profile Saved to Database', 'Your exam profile & study goals have been saved!');
  };

  // Mock Sample PDF option for quick testing
  const handleSelectSample = () => {
    setSelectedFile({
      name: 'Government_Polity_Ref_Notes.pdf',
      size: 450 * 1024,
      isSample: true,
    });
  };

  // Web / Native PDF File Picker Handler
  const handlePickDocument = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          setSelectedFile({
            name: file.name,
            size: file.size,
            file: file
          });
        }
      };
      input.click();
    } else {
      try {
        const DocumentPicker = require('expo-document-picker');
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          setSelectedFile({
            name: asset.name,
            size: asset.size,
            uri: asset.uri,
            mimeType: asset.mimeType
          });
        }
      } catch (err) {
        Alert.alert('Error picking document', err.message);
      }
    }
  };

  // Start AI Quiz Generation
  const handleGenerateQuiz = async () => {
    if (!selectedFile) {
      Alert.alert('File Required', 'Please select a study PDF file first.');
      return;
    }

    const qCount = parseInt(questionCount, 10) || 5;
    const tMins = parseInt(timerMinutes, 10) || 10;

    setIsLoading(true);
    setLoadingStatus('Reading PDF content...');

    try {
      let quizData;

      if (selectedFile.isSample) {
        setLoadingStatus('Analyzing sample notes & generating AI questions...');
        await new Promise(r => setTimeout(r, 1000));
        quizData = {
          title: 'Quiz: Indian Polity & Fundamental Rights',
          documentName: selectedFile.name,
          totalQuestions: 5,
          timerMinutes: tMins,
          difficulty: difficulty,
          questions: [
            {
              id: 'q1',
              question: 'Under which Part of the Indian Constitution are Fundamental Rights guaranteed to citizens?',
              options: ['Part II (Articles 5-11)', 'Part III (Articles 12-35)', 'Part IV (Articles 36-51)', 'Part IV-A (Article 51A)'],
              correctAnswer: 1,
              explanation: 'Part III of the Indian Constitution (Articles 12 to 35) guarantees Fundamental Rights to all citizens.'
            },
            {
              id: 'q2',
              question: 'Which Article of the Constitution was described by Dr. B.R. Ambedkar as the "Heart and Soul of the Constitution"?',
              options: ['Article 14 (Equality before Law)', 'Article 19 (Freedom of Speech)', 'Article 21 (Right to Life)', 'Article 32 (Constitutional Remedies)'],
              correctAnswer: 3,
              explanation: 'Dr. B.R. Ambedkar referred to Article 32 (Right to Constitutional Remedies) as the heart and soul of the Constitution.'
            },
            {
              id: 'q3',
              question: 'By which Constitutional Amendment Act were Fundamental Duties added to the Indian Constitution?',
              options: ['44th Amendment Act, 1978', '42nd Amendment Act, 1976', '86th Amendment Act, 2002', '73rd Amendment Act, 1992'],
              correctAnswer: 1,
              explanation: 'Fundamental Duties were incorporated into Part IV-A (Article 51A) by the 42nd Amendment Act in 1976.'
            },
            {
              id: 'q4',
              question: 'When was the Constitution of India officially adopted by the Constituent Assembly?',
              options: ['15 August 1947', '26 November 1949', '26 January 1950', '30 January 1948'],
              correctAnswer: 1,
              explanation: 'The Constitution was adopted on 26 November 1949 and came into full effect on 26 January 1950.'
            },
            {
              id: 'q5',
              question: 'Which committee recommended the inclusion of Fundamental Duties in the Constitution?',
              options: ['Sarkaria Commission', 'Swaran Singh Committee', 'Balwant Rai Mehta Committee', 'M N Venkatachaliah Commission'],
              correctAnswer: 1,
              explanation: 'The Swaran Singh Committee set up in 1976 recommended adding Fundamental Duties.'
            }
          ]
        };
      } else {
        setLoadingStatus('Uploading PDF & Generating AI Practice Questions...');
        quizData = await generateQuizFromPDF({
          file: selectedFile,
          questionCount: qCount,
          difficulty,
          timerMinutes: tMins
        });
      }

      setCurrentQuiz(quizData);
      setUserAnswers({});
      setTimeRemainingSeconds((quizData.timerMinutes || 10) * 60);
      setIsLoading(false);
      setCurrentScreen('quiz');

    } catch (error) {
      setIsLoading(false);
      Alert.alert('Quiz Generation Failed', error.message || 'Could not process PDF. Please try again.');
    }
  };

  // Timer Countdown Effect
  useEffect(() => {
    if (currentScreen === 'quiz' && timeRemainingSeconds > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemainingSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleFinishQuiz();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [currentScreen]);

  // Finish Quiz & Save to Database
  const handleFinishQuiz = async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    const questions = currentQuiz.questions || [];
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;

    questions.forEach((q, idx) => {
      const selected = userAnswers[idx];
      if (selected === undefined || selected === null) {
        skippedCount++;
      } else if (selected === q.correctAnswer) {
        correctCount++;
      } else {
        wrongCount++;
      }
    });

    const totalTimeSpentSeconds = Math.max(0, ((currentQuiz.timerMinutes || 10) * 60) - timeRemainingSeconds);
    const scorePercentage = Math.round((correctCount / questions.length) * 100);

    const results = {
      scorePercentage,
      correctCount,
      wrongCount,
      skippedCount,
      totalQuestions: questions.length,
      timeSpentSeconds: totalTimeSpentSeconds,
      questions: questions
    };

    setQuizResults(results);

    // Save to Database automatically!
    await saveQuizToDatabase(currentQuiz, results, currentUser?.email || 'student@examprep.com');

    // Refresh History list
    loadHistory();

    setCurrentScreen('score');
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ==================== SCREENS ====================

  // SCREEN 0: PREMIUM LOGIN & SIGN UP
  const renderLoginScreen = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.authCard}>
        {/* Glow Header */}
        <View style={styles.authHeaderBox}>
          <Image
            source={require('./assets/icon.png')}
            style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 10 }}
            resizeMode="contain"
          />
          <Text style={styles.authTitle}>Archi AI Exam Prep</Text>
          <Text style={styles.authSub}>Turn study PDFs into AI exam questions in seconds</Text>
        </View>

        {/* Tab Switcher */}
        <View style={styles.authToggleRow}>
          <TouchableOpacity
            style={[styles.authToggleTab, authMode === 'login' && styles.authToggleTabActive]}
            onPress={() => {
              setAuthMode('login');
              setAuthError('');
            }}
          >
            <Text style={[styles.authToggleText, authMode === 'login' && styles.authToggleTextActive]}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.authToggleTab, authMode === 'signup' && styles.authToggleTabActive]}
            onPress={() => {
              setAuthMode('signup');
              setAuthError('');
            }}
          >
            <Text style={[styles.authToggleText, authMode === 'signup' && styles.authToggleTextActive]}>Create Account</Text>
          </TouchableOpacity>
        </View>

        {authError ? (
          <View style={styles.authErrorBox}>
            <Text style={styles.authErrorText}>⚠️ {authError}</Text>
          </View>
        ) : null}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email Address</Text>
          <TextInput
            style={styles.textInput}
            placeholder="student@examprep.com"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoCapitalize="none"
            value={emailInput}
            onChangeText={setEmailInput}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.textInput}
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            value={passwordInput}
            onChangeText={setPasswordInput}
          />
        </View>

        {isAuthLoading ? (
          <ActivityIndicator size="large" color="#6366F1" style={{ marginVertical: 15 }} />
        ) : (
          <TouchableOpacity style={styles.primaryGradientBtn} onPress={handleAuthAction}>
            <Text style={styles.primaryButtonText}>
              {authMode === 'login' ? '🔐 Sign In to Account' : '✨ Create Free Account'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR QUICK DEMO</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity style={styles.guestDemoBtn} onPress={handleGuestLogin}>
          <Text style={styles.guestDemoBtnText}>⚡ Continue with Demo Mode</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // SCREEN 1: PERSONALIZED HOME DASHBOARD
  const renderHomeScreen = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Premium Hero Banner */}
      <View style={styles.heroGradientCard}>
        <View style={styles.badgeRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={styles.miniAvatarBadge}>
              <Text style={{ fontSize: 18 }}>{userProfile.avatarEmoji}</Text>
            </View>
            <Text style={styles.heroWelcomeTitle}>Hello, {userProfile.name}!</Text>
          </View>
          <TouchableOpacity style={styles.editProfilePill} onPress={() => setCurrentScreen('profile')}>
            <Text style={styles.editProfilePillText}>Profile ⚙️</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroExamBox}>
          <Text style={styles.heroExamLabel}>TARGET EXAM</Text>
          <Text style={styles.heroExamTitle}>{userProfile.examPreparingFor}</Text>
          <Text style={styles.heroGoalSub}>🎯 {userProfile.studyGoal}</Text>
        </View>

        <TouchableOpacity
          style={styles.heroPrimaryBtn}
          onPress={() => setCurrentScreen('upload')}
        >
          <Text style={styles.heroPrimaryBtnText}>⚡ Upload Study PDF & Start Test</Text>
        </TouchableOpacity>
      </View>

      {/* Live Analytics Dashboard */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitleText}>📊 Performance Analytics</Text>
        <Text style={styles.sectionSubText}>Live stats based on your tests</Text>
      </View>

      <View style={styles.analyticsGrid}>
        <View style={[styles.analyticsCard, { borderTopColor: averageScorePercentage >= 60 ? '#10B981' : '#F59E0B' }]}>
          <Text style={styles.analyticsIcon}>🏆</Text>
          <Text style={[styles.analyticsVal, { color: averageScorePercentage >= 60 ? '#10B981' : '#F59E0B' }]}>
            {averageScorePercentage}%
          </Text>
          <Text style={styles.analyticsLabel}>Average Score</Text>
        </View>

        <View style={[styles.analyticsCard, { borderTopColor: '#6366F1' }]}>
          <Text style={styles.analyticsIcon}>📄</Text>
          <Text style={[styles.analyticsVal, { color: '#6366F1' }]}>{totalTestsTaken}</Text>
          <Text style={styles.analyticsLabel}>Tests Taken</Text>
        </View>

        <View style={[styles.analyticsCard, { borderTopColor: '#0EA5E9' }]}>
          <Text style={styles.analyticsIcon}>📝</Text>
          <Text style={[styles.analyticsVal, { color: '#0EA5E9' }]}>{totalQsAttempted}</Text>
          <Text style={styles.analyticsLabel}>Qs Solved</Text>
        </View>

        <View style={[styles.analyticsCard, { borderTopColor: '#10B981' }]}>
          <Text style={styles.analyticsIcon}>✅</Text>
          <Text style={[styles.analyticsVal, { color: '#10B981' }]}>{totalCorrectQs}</Text>
          <Text style={styles.analyticsLabel}>Correct Answers</Text>
        </View>
      </View>

      {/* Target Progress Banner */}
      <View style={styles.targetProgressCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={styles.targetCardTitle}>🔥 Daily Goal Progress</Text>
          <Text style={styles.targetCardBadge}>{userProfile.dailyTarget}</Text>
        </View>
        <Text style={styles.targetCardSub}>
          {totalTestsTaken === 0
            ? 'No tests completed today yet. Upload reference notes to start your first test!'
            : `Awesome progress! You completed ${totalTestsTaken} test(s) with an accuracy rate of ${averageScorePercentage}%.`}
        </Text>

        <TouchableOpacity
          style={[styles.secondaryGlowBtn, { marginTop: 12 }]}
          onPress={() => setCurrentScreen('history')}
        >
          <Text style={styles.secondaryGlowBtnText}>📜 View Complete Test History</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Sample PDF Banner */}
      <View style={styles.sampleBannerCard}>
        <Text style={styles.sampleTitle}>Try a Demo Test PDF</Text>
        <Text style={styles.sampleSub}>Instantly generate a test using pre-loaded Indian Polity reference notes!</Text>
        <TouchableOpacity style={styles.secondaryGlowBtn} onPress={() => {
          handleSelectSample();
          setCurrentScreen('upload');
        }}>
          <Text style={styles.secondaryGlowBtnText}>⚡ Try Pre-loaded Polity Sample</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // SCREEN 2: UPLOAD & CONFIG
  const renderUploadScreen = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <TouchableOpacity style={styles.backButton} onPress={() => setCurrentScreen('home')}>
        <Text style={styles.backButtonText}>← Back to Dashboard</Text>
      </TouchableOpacity>

      <Text style={styles.pageTitle}>Create AI Practice Quiz</Text>
      <Text style={styles.pageSubtitle}>Select your study document and customize test settings</Text>

      <View style={styles.cardBox}>
        <Text style={styles.cardBoxHeader}>1. Reference PDF Document</Text>

        {selectedFile ? (
          <View style={styles.fileSelectedBox}>
            <Text style={styles.fileIcon}>📄</Text>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={styles.fileNameText} numberOfLines={1}>{selectedFile.name}</Text>
              <Text style={styles.fileSizeText}>
                {selectedFile.isSample ? 'Pre-loaded Sample Notes' : `${(selectedFile.size / 1024).toFixed(1)} KB`}
              </Text>
            </View>
            <TouchableOpacity style={styles.changeFileBtn} onPress={handlePickDocument}>
              <Text style={styles.changeFileBtnText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.dropzoneBox} onPress={handlePickDocument}>
            <Text style={styles.dropzoneIcon}>📁</Text>
            <Text style={styles.dropzoneTitle}>Tap to select reference PDF</Text>
            <Text style={styles.dropzoneSub}>Supports notes, chapter guides, & exam syllabi (up to 20MB)</Text>
          </TouchableOpacity>
        )}

        {!selectedFile && (
          <TouchableOpacity style={styles.sampleMiniLink} onPress={handleSelectSample}>
            <Text style={styles.sampleMiniLinkText}>✨ Or use Sample Polity Notes PDF</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.cardBox}>
        <Text style={styles.cardBoxHeader}>2. Quiz Customization</Text>

        <Text style={styles.settingLabel}>Number of Questions: <Text style={styles.settingValue}>{questionCount || '—'}</Text></Text>
        <View style={styles.chipRow}>
          {[5, 10, 15, 20].map(cnt => (
            <TouchableOpacity
              key={cnt}
              style={[styles.chip, questionCount === cnt && styles.chipActive]}
              onPress={() => setQuestionCount(cnt)}
            >
              <Text style={[styles.chipText, questionCount === cnt && styles.chipTextActive]}>{cnt} Qs</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={[styles.textInput, { marginTop: 10, height: 44, fontSize: 14 }]}
          placeholder="Or type custom number of questions (e.g. 25, 50)"
          placeholderTextColor="#94A3B8"
          keyboardType="number-pad"
          value={questionCount ? questionCount.toString() : ''}
          onChangeText={(val) => {
            const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
            setQuestionCount(isNaN(num) ? '' : num);
          }}
        />

        <Text style={[styles.settingLabel, { marginTop: 16 }]}>Time Limit: <Text style={styles.settingValue}>{timerMinutes ? `${timerMinutes} mins` : 'Untimed'}</Text></Text>
        <View style={styles.chipRow}>
          {[5, 10, 15, 30].map(mins => (
            <TouchableOpacity
              key={mins}
              style={[styles.chip, timerMinutes === mins && styles.chipActive]}
              onPress={() => setTimerMinutes(mins)}
            >
              <Text style={[styles.chipText, timerMinutes === mins && styles.chipTextActive]}>{mins} min</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={[styles.textInput, { marginTop: 10, height: 44, fontSize: 14 }]}
          placeholder="Or type custom time limit in minutes (e.g. 45, 60)"
          placeholderTextColor="#94A3B8"
          keyboardType="number-pad"
          value={timerMinutes ? timerMinutes.toString() : ''}
          onChangeText={(val) => {
            const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
            setTimerMinutes(isNaN(num) ? '' : num);
          }}
        />

        <Text style={[styles.settingLabel, { marginTop: 16 }]}>Difficulty Level:</Text>
        <View style={styles.chipRow}>
          {['easy', 'medium', 'hard'].map(level => (
            <TouchableOpacity
              key={level}
              style={[styles.chip, difficulty === level && styles.chipActive]}
              onPress={() => setDifficulty(level)}
            >
              <Text style={[styles.chipText, difficulty === level && styles.chipTextActive]}>
                {level.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>{loadingStatus}</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.primaryGradientBtn} onPress={handleGenerateQuiz}>
          <Text style={styles.primaryButtonText}>✨ Generate Practice Quiz</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  // SCREEN 3: QUIZ PLAYER
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showExplanation, setShowExplanation] = useState({});

  const renderQuizScreen = () => {
    if (!currentQuiz || !currentQuiz.questions) return null;

    const questions = currentQuiz.questions;
    const currentQ = questions[currentQuestionIndex];
    const totalQ = questions.length;
    const selectedOption = userAnswers[currentQuestionIndex];

    const isTimerWarning = timeRemainingSeconds < 120;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0F172A' }}>
        <View style={styles.quizTopBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.quizBarTitle} numberOfLines={1}>{currentQuiz.title}</Text>
            <Text style={styles.quizBarProgress}>Question {currentQuestionIndex + 1} of {totalQ}</Text>
          </View>

          <View style={[styles.quizTimerBadge, isTimerWarning && styles.quizTimerBadgeWarning]}>
            <Text style={[styles.quizTimerText, isTimerWarning && styles.quizTimerTextWarning]}>
              ⏱️ {formatTime(timeRemainingSeconds)}
            </Text>
          </View>
        </View>

        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarGlowFill, { width: `${((currentQuestionIndex + 1) / totalQ) * 100}%` }]} />
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <View style={styles.questionGlowCard}>
            <View style={styles.qBadgeBox}>
              <Text style={styles.qBadgeText}>Question {currentQuestionIndex + 1}</Text>
            </View>
            <Text style={styles.questionMainText}>{currentQ.question}</Text>

            <View style={{ marginTop: 18 }}>
              {currentQ.options.map((optionText, optIdx) => {
                const isSelected = selectedOption === optIdx;
                const isCorrect = currentQ.correctAnswer === optIdx;
                const hasAnswered = selectedOption !== undefined;

                let optCardStyle = styles.quizOptionCard;
                let optTextStyle = styles.quizOptionText;

                if (hasAnswered) {
                  if (isSelected) {
                    optCardStyle = isCorrect ? styles.quizOptionCorrect : styles.quizOptionIncorrect;
                    optTextStyle = styles.quizOptionTextSelected;
                  } else if (isCorrect && showExplanation[currentQuestionIndex]) {
                    optCardStyle = styles.quizOptionCorrectHighlight;
                  }
                }

                return (
                  <TouchableOpacity
                    key={optIdx}
                    style={optCardStyle}
                    activeOpacity={0.85}
                    onPress={() => {
                      setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: optIdx }));
                      setShowExplanation(prev => ({ ...prev, [currentQuestionIndex]: true }));
                    }}
                  >
                    <View style={styles.optLetterRing}>
                      <Text style={styles.optLetterText}>{String.fromCharCode(65 + optIdx)}</Text>
                    </View>
                    <Text style={[optTextStyle, { flex: 1 }]}>{optionText}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedOption !== undefined && (
              <View style={styles.aiExplCard}>
                <Text style={styles.aiExplTitle}>
                  {selectedOption === currentQ.correctAnswer ? '✅ Correct Answer!' : '❌ Incorrect Choice'} — AI Explanation:
                </Text>
                <Text style={styles.aiExplBody}>{currentQ.explanation}</Text>
              </View>
            )}
          </View>

          <View style={styles.quizNavRow}>
            <TouchableOpacity
              style={[styles.quizPrevBtn, currentQuestionIndex === 0 && styles.quizNavBtnDisabled]}
              disabled={currentQuestionIndex === 0}
              onPress={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
            >
              <Text style={styles.quizPrevBtnText}>← Previous</Text>
            </TouchableOpacity>

            {currentQuestionIndex < totalQ - 1 ? (
              <TouchableOpacity
                style={styles.quizNextBtn}
                onPress={() => setCurrentQuestionIndex(prev => Math.min(totalQ - 1, prev + 1))}
              >
                <Text style={styles.quizNextBtnText}>Next Question →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.quizSubmitBtn} onPress={handleFinishQuiz}>
                <Text style={styles.quizSubmitBtnText}>Submit Test 🎯</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  };

  // SCREEN 4: SCORE SUMMARY
  const renderScoreScreen = () => {
    if (!quizResults) return null;

    const { scorePercentage, correctCount, wrongCount, skippedCount, totalQuestions, timeSpentSeconds, questions } = quizResults;
    const isPassed = scorePercentage >= 60;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.scoreGlowHero, isPassed ? styles.scorePassGlow : styles.scoreFailGlow]}>
          <Text style={styles.scoreHeroEmoji}>{isPassed ? '🏆' : '📚'}</Text>
          <Text style={styles.scoreHeroPercent}>{scorePercentage}%</Text>
          <Text style={styles.scoreHeroTitle}>
            {isPassed ? 'Outstanding! You are Exam Ready!' : 'Keep practicing! Review explanations below.'}
          </Text>
          <Text style={styles.scoreHeroSub}>🔥 Score Saved to Database!</Text>
        </View>

        <View style={styles.scoreStatsRow}>
          <View style={styles.scoreStatBox}>
            <Text style={[styles.scoreStatVal, { color: '#10B981' }]}>{correctCount}</Text>
            <Text style={styles.scoreStatLbl}>Correct</Text>
          </View>
          <View style={styles.scoreStatBox}>
            <Text style={[styles.scoreStatVal, { color: '#EF4444' }]}>{wrongCount}</Text>
            <Text style={styles.scoreStatLbl}>Wrong</Text>
          </View>
          <View style={styles.scoreStatBox}>
            <Text style={[styles.scoreStatVal, { color: '#64748B' }]}>{skippedCount}</Text>
            <Text style={styles.scoreStatLbl}>Skipped</Text>
          </View>
          <View style={styles.scoreStatBox}>
            <Text style={[styles.scoreStatVal, { color: '#6366F1' }]}>{totalQuestions}</Text>
            <Text style={styles.scoreStatLbl}>Total Qs</Text>
          </View>
        </View>

        <Text style={styles.sectionTitleText}>Question Breakdown & AI Review:</Text>

        {questions.map((q, idx) => {
          const userAns = userAnswers[idx];
          const isCorrect = userAns === q.correctAnswer;
          const isSkipped = userAns === undefined || userAns === null;

          return (
            <View key={idx} style={styles.reviewCardBox}>
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewQNumText}>Q{idx + 1}</Text>
                <Text style={[styles.reviewBadgeTag, isCorrect ? styles.badgeTagGreen : isSkipped ? styles.badgeTagGray : styles.badgeTagRed]}>
                  {isCorrect ? 'Correct ✓' : isSkipped ? 'Skipped' : 'Incorrect ✗'}
                </Text>
              </View>

              <Text style={styles.reviewQText}>{q.question}</Text>

              <Text style={styles.reviewAnsText}>
                Your Choice: <Text style={{ fontWeight: 'bold' }}>{isSkipped ? 'Not Answered' : q.options[userAns]}</Text>
              </Text>
              {!isCorrect && (
                <Text style={[styles.reviewAnsText, { color: '#10B981', marginTop: 4 }]}>
                  Correct Answer: <Text style={{ fontWeight: 'bold' }}>{q.options[q.correctAnswer]}</Text>
                </Text>
              )}

              <View style={styles.reviewExplBox}>
                <Text style={styles.reviewExplTitle}>💡 Explanation:</Text>
                <Text style={styles.reviewExplText}>{q.explanation}</Text>
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.primaryGradientBtn}
          onPress={() => setCurrentScreen('upload')}
        >
          <Text style={styles.primaryButtonText}>📄 Create Another Quiz from PDF</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryGlowBtn, { marginTop: 10, marginBottom: 30 }]}
          onPress={() => setCurrentScreen('history')}
        >
          <Text style={styles.secondaryGlowBtnText}>📜 View All Past Quizzes & Scores</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // SCREEN 5: QUIZ HISTORY
  const renderHistoryScreen = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <TouchableOpacity style={styles.backButton} onPress={() => setCurrentScreen('home')}>
        <Text style={styles.backButtonText}>← Back to Dashboard</Text>
      </TouchableOpacity>

      <Text style={styles.pageTitle}>📜 Test Score History</Text>
      <Text style={styles.pageSubtitle}>Review all your past PDF practice test attempts</Text>

      {isLoadingHistory ? (
        <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 30 }} />
      ) : quizHistoryList.length === 0 ? (
        <View style={styles.cardBox}>
          <Text style={{ textAlign: 'center', color: '#64748B', marginVertical: 20 }}>
            No past quizzes recorded yet. Generate a quiz from PDF to start tracking!
          </Text>
        </View>
      ) : (
        quizHistoryList.map((item, index) => (
          <View key={item.id || index} style={styles.cardBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A', flex: 1 }} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: item.scorePercentage >= 60 ? '#10B981' : '#EF4444' }}>
                {item.scorePercentage}%
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              📄 {item.documentName} • 📅 {item.date}
            </Text>
            <Text style={{ fontSize: 13, color: '#334155', marginTop: 6 }}>
              Score: <Text style={{ fontWeight: '700' }}>{item.correctCount}</Text> of <Text style={{ fontWeight: '700' }}>{item.totalQuestions}</Text> Correct
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );

  // SCREEN 6: MY PROFILE SCREEN
  const renderProfileScreen = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <TouchableOpacity style={styles.backButton} onPress={() => setCurrentScreen('home')}>
        <Text style={styles.backButtonText}>← Back to Dashboard</Text>
      </TouchableOpacity>

      <Text style={styles.pageTitle}>👤 Student Exam Profile</Text>
      <Text style={styles.pageSubtitle}>Personalize your target exam details & study goals</Text>

      <View style={styles.cardBox}>
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          <View style={styles.avatarGlowCircle}>
            <Text style={{ fontSize: 44 }}>{userProfile.avatarEmoji}</Text>
          </View>
          <Text style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>Select Profile Avatar:</Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            {['🎓', '👩‍🎓', '📚', '🎯', '💡'].map(emoji => (
              <TouchableOpacity
                key={emoji}
                style={[styles.emojiChip, userProfile.avatarEmoji === emoji && styles.emojiChipActive]}
                onPress={() => setUserProfile(prev => ({ ...prev, avatarEmoji: emoji }))}
              >
                <Text style={{ fontSize: 20 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Student Full Name</Text>
          <TextInput
            style={styles.textInput}
            value={userProfile.name}
            onChangeText={(val) => setUserProfile(prev => ({ ...prev, name: val }))}
            placeholder="e.g. Rahul / Ananya"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Phone Number (Optional)</Text>
          <TextInput
            style={styles.textInput}
            value={userProfile.phone}
            onChangeText={(val) => setUserProfile(prev => ({ ...prev, phone: val }))}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Exam Preparing For</Text>
          <View style={styles.chipRow}>
            {['UPSC Civil Services', 'SSC CGL', 'State PSC', 'Banking / IBPS', 'Railways RRB'].map(exam => (
              <TouchableOpacity
                key={exam}
                style={[styles.chip, userProfile.examPreparingFor === exam && styles.chipActive]}
                onPress={() => setUserProfile(prev => ({ ...prev, examPreparingFor: exam }))}
              >
                <Text style={[styles.chipText, userProfile.examPreparingFor === exam && styles.chipTextActive]}>{exam}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Current Study Goal</Text>
          <TextInput
            style={styles.textInput}
            value={userProfile.studyGoal}
            onChangeText={(val) => setUserProfile(prev => ({ ...prev, studyGoal: val }))}
            placeholder="e.g. Master Syllabus & Score 85%+"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Daily Practice Target</Text>
          <TextInput
            style={styles.textInput}
            value={userProfile.dailyTarget}
            onChangeText={(val) => setUserProfile(prev => ({ ...prev, dailyTarget: val }))}
            placeholder="e.g. 2 Quizzes / Day"
          />
        </View>

        {isSavingProfile ? (
          <ActivityIndicator size="large" color="#6366F1" style={{ marginVertical: 15 }} />
        ) : (
          <TouchableOpacity style={styles.primaryGradientBtn} onPress={handleSaveProfile}>
            <Text style={styles.primaryButtonText}>💾 Save Profile Changes</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.cardBox}>
        <Text style={styles.cardBoxHeader}>Account Information</Text>
        <Text style={{ fontSize: 14, color: '#475569', marginBottom: 4 }}>
          Signed in as: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{currentUser?.email || 'student@examprep.com'}</Text>
        </Text>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>🚪 Logout of Account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0F172A' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Modern Top Navbar */}
      <View style={styles.navbarHeader}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          onPress={() => setCurrentScreen(currentUser ? 'home' : 'login')}
        >
          <Image
            source={require('./assets/icon.png')}
            style={{ width: 28, height: 28, borderRadius: 6 }}
            resizeMode="contain"
          />
          <Text style={styles.navbarBrandTitle}>Archi AI Exam Prep</Text>
        </TouchableOpacity>

        {currentUser ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              style={[styles.navTabPill, currentScreen === 'home' && styles.navTabPillActive]}
              onPress={() => setCurrentScreen('home')}
            >
              <Text style={[styles.navTabPillText, currentScreen === 'home' && styles.navTabPillTextActive]}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navTabPill, currentScreen === 'history' && styles.navTabPillActive]}
              onPress={() => setCurrentScreen('history')}
            >
              <Text style={[styles.navTabPillText, currentScreen === 'history' && styles.navTabPillTextActive]}>History</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navTabPill, currentScreen === 'profile' && styles.navTabPillActive]}
              onPress={() => setCurrentScreen('profile')}
            >
              <Text style={[styles.navTabPillText, currentScreen === 'profile' && styles.navTabPillTextActive]}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navLogoutBtn} onPress={handleLogout}>
              <Text style={styles.navLogoutBtnText}>Logout 🚪</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.navTabPillActive} onPress={() => setCurrentScreen('login')}>
            <Text style={styles.navTabPillTextActive}>Login 🔐</Text>
          </TouchableOpacity>
        )}
      </View>

      {currentScreen === 'login' && renderLoginScreen()}
      {currentScreen === 'home' && renderHomeScreen()}
      {currentScreen === 'upload' && renderUploadScreen()}
      {currentScreen === 'quiz' && renderQuizScreen()}
      {currentScreen === 'score' && renderScoreScreen()}
      {currentScreen === 'history' && renderHistoryScreen()}
      {currentScreen === 'profile' && renderProfileScreen()}
    </SafeAreaView>
  );
}

// STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Navbar
  navbarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  navbarBrandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  navTabPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  navTabPillActive: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
  },
  navTabPillText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  navTabPillTextActive: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  navLogoutBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  navLogoutBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },

  // Auth Card
  authCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#6366F1',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  authHeaderBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  authLogoBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#818CF8',
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  authSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  authToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  authToggleTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  authToggleTabActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  authToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  authToggleTextActive: {
    color: '#6366F1',
    fontWeight: '800',
  },
  authErrorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  authErrorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },

  // Form Controls
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  primaryGradientBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  guestDemoBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  guestDemoBtnText: {
    color: '#0D9488',
    fontSize: 15,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 10,
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
  },

  // Dashboard Styles
  heroGradientCard: {
    backgroundColor: '#1E1B4B',
    borderRadius: 20,
    padding: 22,
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  miniAvatarBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#3730A3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroWelcomeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  editProfilePill: {
    backgroundColor: '#3730A3',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  editProfilePillText: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '600',
  },
  heroExamBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  heroExamLabel: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroExamTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  heroGoalSub: {
    fontSize: 13,
    color: '#C7D2FE',
    marginTop: 4,
  },
  heroPrimaryBtn: {
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
  },
  heroPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  // Analytics Grid
  sectionHeaderRow: {
    marginBottom: 12,
  },
  sectionTitleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  analyticsCard: {
    width: (width - 44) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopWidth: 4,
    alignItems: 'center',
  },
  analyticsIcon: {
    fontSize: 26,
    marginBottom: 4,
  },
  analyticsVal: {
    fontSize: 24,
    fontWeight: '900',
  },
  analyticsLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  targetProgressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  targetCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  targetCardBadge: {
    backgroundColor: '#EEF2FF',
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  targetCardSub: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  secondaryGlowBtn: {
    backgroundColor: '#EEF2FF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryGlowBtnText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '700',
  },
  sampleBannerCard: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 16,
    padding: 18,
    marginTop: 4,
  },
  sampleTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F766E',
  },
  sampleSub: {
    fontSize: 13,
    color: '#115E59',
    marginVertical: 6,
  },

  // Setup / Upload Screen
  pageTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
  },
  cardBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardBoxHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  dropzoneBox: {
    borderWidth: 2,
    borderColor: '#C7D2FE',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
  },
  dropzoneIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  dropzoneTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3730A3',
  },
  dropzoneSub: {
    fontSize: 12,
    color: '#6366F1',
    marginTop: 4,
    textAlign: 'center',
  },
  fileSelectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 12,
  },
  fileIcon: {
    fontSize: 28,
  },
  fileNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  fileSizeText: {
    fontSize: 12,
    color: '#64748B',
  },
  changeFileBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changeFileBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  sampleMiniLink: {
    marginTop: 10,
    alignSelf: 'center',
  },
  sampleMiniLinkText: {
    color: '#6366F1',
    fontWeight: '700',
    fontSize: 13,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  settingValue: {
    color: '#6366F1',
    fontWeight: '800',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  loadingBox: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#6366F1',
    fontWeight: '700',
    fontSize: 14,
  },

  // Quiz Player Screen
  quizTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  quizBarTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: width * 0.55,
  },
  quizBarProgress: {
    fontSize: 12,
    color: '#94A3B8',
  },
  quizTimerBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quizTimerBadgeWarning: {
    backgroundColor: '#7F1D1D',
    borderColor: '#EF4444',
  },
  quizTimerText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#38BDF8',
  },
  quizTimerTextWarning: {
    color: '#FFFFFF',
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: '#1E293B',
  },
  progressBarGlowFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
  },
  questionGlowCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  qBadgeBox: {
    backgroundColor: '#EEF2FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 12,
  },
  qBadgeText: {
    color: '#6366F1',
    fontWeight: '800',
    fontSize: 13,
  },
  questionMainText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 26,
  },
  quizOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  quizOptionCorrect: {
    backgroundColor: '#DCFCE7',
    borderColor: '#22C55E',
  },
  quizOptionIncorrect: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  quizOptionCorrectHighlight: {
    backgroundColor: '#DCFCE7',
    borderColor: '#22C55E',
  },
  optLetterRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optLetterText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
  },
  quizOptionText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 22,
  },
  quizOptionTextSelected: {
    fontWeight: '800',
    color: '#0F172A',
  },
  aiExplCard: {
    marginTop: 16,
    backgroundColor: '#F0FDFA',
    borderLeftWidth: 4,
    borderLeftColor: '#0D9488',
    padding: 14,
    borderRadius: 10,
  },
  aiExplTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F766E',
    marginBottom: 4,
  },
  aiExplBody: {
    fontSize: 13,
    color: '#115E59',
    lineHeight: 18,
  },
  quizNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quizPrevBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  quizNavBtnDisabled: {
    opacity: 0.4,
  },
  quizPrevBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  quizNextBtn: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: '#6366F1',
  },
  quizNextBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  quizSubmitBtn: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: '#10B981',
  },
  quizSubmitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Score Screen
  scoreGlowHero: {
    borderRadius: 22,
    padding: 26,
    alignItems: 'center',
    marginBottom: 20,
  },
  scorePassGlow: {
    backgroundColor: '#065F46',
  },
  scoreFailGlow: {
    backgroundColor: '#991B1B',
  },
  scoreHeroEmoji: {
    fontSize: 44,
    marginBottom: 6,
  },
  scoreHeroPercent: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  scoreHeroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
    textAlign: 'center',
  },
  scoreHeroSub: {
    fontSize: 13,
    color: '#E0E7FF',
    marginTop: 6,
  },
  scoreStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  scoreStatBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scoreStatVal: {
    fontSize: 18,
    fontWeight: '900',
  },
  scoreStatLbl: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  reviewCardBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reviewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewQNumText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  reviewBadgeTag: {
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeTagGreen: {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
  },
  badgeTagRed: {
    backgroundColor: '#FEE2E2',
    color: '#B91C1C',
  },
  badgeTagGray: {
    backgroundColor: '#F1F5F9',
    color: '#475569',
  },
  reviewQText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  reviewAnsText: {
    fontSize: 13,
    color: '#334155',
  },
  reviewExplBox: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
  },
  reviewExplTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  reviewExplText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },

  // Profile Screen
  avatarGlowCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#6366F1',
  },
  emojiChip: {
    padding: 8,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  emojiChipActive: {
    backgroundColor: '#C7D2FE',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  logoutBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  logoutBtnText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '800',
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    color: '#6366F1',
    fontSize: 15,
    fontWeight: '700',
  },
});
