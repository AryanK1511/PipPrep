import type { PartView } from '../lib/types'

export function Source({ part }: { part: PartView }) {
  if (part.visual) {
    const { heading, subtitle, columns, rows, note } = part.visual
    return <article className="flyer">
      <header className="flyer-head">
        <div><h2>{heading}</h2><p>{subtitle}</p></div>
        <img src="/flyer-motif.svg" alt="" width="148" height="130" />
      </header>
      <div className="table-scroll" role="region" aria-label="Flyer details" tabIndex={0}>
        <table><thead><tr>{columns.map((cell, i) => <th scope="col" key={i}>{cell}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th scope="row" key={j}>{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <footer className="flyer-note"><h3>Good to know</h3><p>{note}</p></footer>
    </article>
  }
  return <article className="passage"><h2>{part.title}</h2>
    {part.paragraphs.map((text, i) => <div className="paragraph" key={i}>
      {part.index === 2 && <span className="paragraph-label">{'ABCD'[i]}</span>}<p>{text}</p>
    </div>)}
    {part.index === 2 && <p className="e-note"><strong>E</strong> · Information not stated in the passage</p>}
  </article>
}
