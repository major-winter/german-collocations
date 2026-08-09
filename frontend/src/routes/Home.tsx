import { SearchBox } from '../components/SearchBox.tsx';

export function Home() {
    return (
        <main>
            <h1>German Collocations</h1>
            <p>Look up a word to see what commonly appears before and after it.</p>
            <SearchBox initialValue="" />
        </main>
    );
}
